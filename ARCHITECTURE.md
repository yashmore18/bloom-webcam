# Architecture — Bloom

## Guiding principle
A single static, client-side app: build with Vite, ship the `dist/` folder to Vercel. Everything (camera, tracking, rendering, recording) runs in the browser. Two small interfaces provide a seam so new generative templates and interaction sources are cheap to add — a seam, not a framework (keep each interface to 2–3 methods).

## Tech stack
| Layer | Choice | Why |
|---|---|---|
| Build/dev | Vite + TypeScript | HMR, typed codebase, static prod output |
| Rendering | three.js (npm) + `examples/jsm` postprocessing | WebGL scene graph, real bloom/glow; imperative (not R3F) for a per-frame mutation loop |
| Hand tracking | `@mediapipe/tasks-vision` (npm, pinned) | Client-side `HandLandmarker`, privacy-preserving |
| Recording | `canvas.captureStream` + `MediaRecorder` | Native, no dependency |
| Tests | Vitest (logic) + Playwright (headless render checks) | |
| Hosting | Vercel (Vite preset) | Static, zero-config |

## Extensibility interfaces (`src/types.ts`)
- **`InteractionSource`**: `init(video)`, `getStates(timestamp) → HandState[]`.
- **`TemplateModule`**: `init(scene)`, `update(states, dt)`, `dispose()`.
- **`HandState`** = `{ id, x, y, pinch, landmarks }`. The data bag is where richer per-frame info lives, so the interfaces stay tiny. `main.ts` holds a one-entry template registry and never needs editing to add a second template.

## Data flow (per frame)
1. `main.ts` pipes `getUserMedia` into a hidden `<video>`, drawn as a mirrored `VideoTexture` background plane inside the scene (single canvas → simple recording).
2. `hand-tracking.ts` runs `HandLandmarker.detectForVideo(video, timestamp)`, smooths landmarks (lerp ~0.2), assigns **stable per-hand IDs** via greedy nearest-neighbor vs. the previous frame, and computes `pinch` + pinch-midpoint position. Emits `HandState[]`.
3. `hand-skeleton.ts` draws the glowing 21-landmark skeleton (bones + joints) for each hand, mirrored to match the video.
4. `plant.ts` (via `plant-manager.ts`) creates/updates/fades one plant per hand id: growth eased toward `pinch`, position at the pinch midpoint.
5. `EffectComposer` renders the scene through `UnrealBloomPass` for glow.
6. Record: `recorder.ts` captures `renderer.domElement.captureStream(30)` into a `MediaRecorder`, assembling a downloadable `.webm`.

## L-system (`src/lsystem/lsystem.ts`, pure)
- Axiom + production rules expanded to a fixed depth, then turtle-interpreted (F = forward/draw, +/- = turn, [ ] = push/pop) into `{ segments:[{x1,y1,x2,y2,birth}], flowers:[{x,y,birth}] }`.
- `birth` ∈ [0,1] = normalized path-distance from the root, so growth reveals root→tips. Whole structure normalized/scaled to a target height with the root at origin. Optional seeded jitter so each hand's plant differs.
- Rendering: all segments as one `LineSegments` BufferGeometry with a per-vertex `birth` attribute; a `ShaderMaterial` with a `uGrowth` uniform `discard`s segments where `birth > uGrowth` — smooth growth, one draw call. Flower heads at tips scale in as growth passes their birth.

## Hand tracking details
- `HandLandmarker` from `@mediapipe/tasks-vision`, model `hand_landmarker.task` (Google-hosted URL — verify current path at build time). `numHands: 2`, `runningMode: "VIDEO"`.
- `pinch = normalize( dist(#4,#8) / dist(#0,#9) )` (index/thumb tips over hand size, scale-invariant). Position = midpoint of #4/#8, mirrored X, mapped to `[-1,1]`.
- Stable IDs: greedy nearest-neighbor to previous frame by palm position; new hand if unmatched beyond a distance threshold; hand missing >500ms → fade its plant out, then remove.

## Deployment
- No special build config — `vite build` → `dist/`. On Vercel: framework preset "Vite", output `dist/`. Local: `npm run dev` (camera needs a real origin, not `file://`).
