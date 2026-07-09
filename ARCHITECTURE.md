# Architecture — Bloom

## Guiding principle
A single static, client-side app: build with Vite, ship the `dist/` folder to Vercel. Everything (camera, tracking, rendering, recording) runs in the browser. Two small interfaces provide a seam so new generative templates and interaction sources are cheap to add — a seam, not a framework (keep each interface to 2–3 methods).

## Tech stack
| Layer | Choice | Why |
|---|---|---|
| Build/dev | Vite + TypeScript | HMR, typed codebase, static prod output |
| Rendering | three.js (npm) + `examples/jsm` postprocessing | WebGL scene graph, real bloom/glow; imperative (not R3F) for a per-frame mutation loop |
| Hand tracking | `@mediapipe/tasks-vision` (npm, pinned `0.10.35`) | Client-side `HandLandmarker`, privacy-preserving; also reports per-hand handedness |
| Recording | `canvas.captureStream` + `MediaRecorder` | Native, no dependency |
| Tests | Vitest (logic) + Playwright (headless render checks) | |
| Hosting | Vercel (Vite preset) | Static, zero-config |

## Extensibility interfaces (`src/types.ts`)
- **`InteractionSource`**: `init(video)`, `getStates(timestamp) → HandState[]`.
- **`TemplateModule`**: `init(scene)`, `update(states, dt)`, `dispose()`.
- **`HandState`** = `{ id, x, y, pinch, landmarks, handedness? }`. The data bag is where richer per-frame info lives, so the interfaces stay tiny. `main.ts` holds a one-entry template registry and never needs editing to add a second template.
- **`HandRole`** = `"grow" | "bloom"`, computed per-frame from `HandState[]` by `src/hand/roles.ts` and shared by the plant template and the skeleton overlay (so tint/label and actual control always agree).

## Data flow (per frame)
1. `main.ts` pipes `getUserMedia` into a hidden `<video>`, drawn as a mirrored, **dimmed** `VideoTexture` background plane inside the scene (single canvas → simple recording; dimming keeps the video below the bloom threshold).
2. `hand-tracking.ts` runs `HandLandmarker.detectForVideo(video, timestamp)`, smooths landmarks (lerp), assigns **stable per-hand IDs** via greedy nearest-neighbor vs. the previous frame (same-handedness pairs preferred as a soft tiebreak), and computes `pinch` + the pinch-midpoint position + handedness (when the model is confident). Emits `HandState[]`.
3. `roles.ts` assigns each present hand a role — **Grow** or **Bloom** — preferring MediaPipe handedness (Left→Grow, Right→Bloom, stable through crossing/closeness), falling back to screen-side (left-most = Grow) if handedness is missing or ambiguous.
4. `hand-skeleton.ts` draws the glowing 21-landmark skeleton for each hand, tinted by its role, with a live "Grow: n.nn" / "Bloom: n.nn" label sprite near the wrist.
5. `plant-manager.ts` (`PlantTemplate`) owns **one shared plant**: the Grow-role hand's `pinch` eases the plant's `grow` target, the Bloom-role hand's `pinch` eases `bloom`; an absent role holds its last value while ≥1 hand is present, and both ease to 0 with no hands (plant recedes). The plant's position eases toward the average `(x,y)` of present hands (offset down a bit), holding in place when no hands are present.
6. `EffectComposer` renders the scene through `UnrealBloomPass` for glow (tuned so blooms stay legible rather than blown out).
7. Record: `recorder.ts` captures `renderer.domElement.captureStream(30)` into a `MediaRecorder`, assembling a downloadable `.webm` (skeleton + labels are part of the captured canvas).

## L-system (`src/lsystem/lsystem.ts`, pure)
- **Rule:** symmetric **monopodial** `X → F[+X][-X]FX` (a central leader keeps climbing while two mirrored side branches peel off), expanded to a fixed depth, then turtle-interpreted into `{ segments:[{x1,y1,x2,y2,birth}], flowers:[{x,y,birth,angle}] }`. The central leader + left/right symmetry keep the bouquet upright (a V/funnel shape) with no sideways lean.
- **Organic curl:** each `F` step is drawn as several short sub-segments; the turtle's heading follows a damped, randomly-accelerated angular velocity (so it curves smoothly, not jaggedly) plus a small up-righting bias pulling back toward vertical — enough curl to look natural, not enough to wander off-axis.
- `birth` = normalized path-distance from the root, **capped below 1** (`BIRTH_MAX`, not a full `[0,1]`) — because `grow` only *approaches* 1 asymptotically (eased, never snaps), tips born exactly at birth=1 could never fully reveal/flower. Whole structure scaled to a target height with the root at the origin.
- Flowers are deduped by spatial cell (many terminal `X`s can land at/near the same point) and capped at a max count, keeping the ones with the highest birth (outermost).

## Plant rendering (`src/plant/plant.ts`)
- **Stems:** rendered as one indexed triangle mesh — each line segment becomes a thin quad (real width, offset perpendicular to its direction), not a 1px `LineSegments`. A per-vertex `birth` attribute + `uGrowth` uniform `discard`s any part of the stem past the current reveal point in the fragment shader — smooth growth, one draw call, and the growing frontier is brightened for a glowing tip.
- **Flowers:** a shared 6-lobe rosette shape + center dot, from a small multicolor palette. `grow` gates whether a flower has appeared at all (eases in as a small bud once `grow` passes that flower's `birth`); `bloom` separately eases the bud from a small fraction up to full size — so grow and bloom are visually independent (a plant can be fully grown with tight buds, or partially grown with what's revealed fully open).

## Hand tracking details (`src/hand/hand-tracking.ts`)
- `HandLandmarker` from `@mediapipe/tasks-vision`, model `hand_landmarker.task` (Google-hosted URL — verify current path at build time; the npm package version and the CDN-hosted WASM version must match). `numHands: 2`, `runningMode: "VIDEO"`, `delegate: "GPU"`.
- `pinch = normalize( dist(#4,#8) / dist(#0,#9) )` (thumb/index tips over hand size, scale-invariant), range tuned so a moderate spread reaches 0/1, not an extreme stretch. Position = midpoint of #4/#8, mirrored X, mapped to `[-1,1]`.
- **Handedness:** taken from `result.handedness` per detection, only trusted above a confidence threshold; carried onto `HandState` for role assignment and ID matching.
- Stable IDs: greedy nearest-neighbor to the previous frame by palm position, with a small distance penalty for a handedness mismatch (soft preference, not a hard rule — so a brief mislabel can't break tracking); new hand if unmatched beyond a distance threshold; a hand not seen for >500ms is dropped.

## Deployment
- No special build config — `vite build` → `dist/`. On Vercel: framework preset "Vite", output `dist/`. Local: `npm run dev` (camera needs a real origin, not `file://`).
