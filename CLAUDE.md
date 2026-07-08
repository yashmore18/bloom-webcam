# CLAUDE.md — Bloom

Bloom is a **webcam-reactive generative-art playground**: you see your hands tracked live as a glowing skeleton, and you **pinch your fingers to grow procedural L-system plants** that bloom at their tips. Think "TouchDesigner + MediaPipe, in the browser, but fun and immediate." Single-page, fully client-side, deployed as a static site on Vercel.

## Core experience (what "done" feels like)
- Open the page → grant camera → your mirrored webcam fills the screen.
- Raise your hands → a **glowing 21-point skeleton** tracks each hand in real time (this is the "it's alive / it sees me" moment — it must be visible and smooth).
- **Pinch** thumb + index together, then **spread them apart** → an **L-system plant grows** out of that point, blooming flowers at the branch tips. Pinch back together → it recedes to a seed.
- **Move your hand** → the plant follows and sways.
- Two hands → two independent plants.
- **Record** → grow some plants → **Stop** → download a `.webm` clip.

## Tech stack (this is a real build now — not CDN script tags)
- **Vite + TypeScript** — dev server with HMR, typed codebase, static prod build.
- **three.js** (npm) for WebGL rendering; imperative three.js, **not** React-Three-Fiber (this is a tight per-frame loop mutating GPU buffers from the detection callback).
- **@mediapipe/tasks-vision** (npm, pinned) — `HandLandmarker`, `numHands: 2`, `runningMode: "VIDEO"`, client-side (camera never leaves the device).
- **EffectComposer + UnrealBloomPass** for the glow aesthetic.
- **MediaRecorder + `canvas.captureStream`** for recording — no library.
- **Vitest** for pure-logic unit tests (the L-system), **Playwright** headless for render verification.
- Deploy: **Vercel** (Vite preset, output `dist/`).

## Commands
- `npm run dev` — dev server at http://localhost:5173 (HMR; you rarely need to hard-refresh).
- `npm run build` — typecheck (`tsc --noEmit`) + `vite build` to `dist/`.
- `npm test` — Vitest. `npm run typecheck`, `npm run lint`.

## Architecture & extensibility
Two small interfaces (in `src/types.ts`) keep the seam clean — keep each to **2–3 methods**; richer per-frame data rides inside `HandState`, not in extra methods.
- **`InteractionSource`** — `init(video)`, `getStates(timestamp) → HandState[]`. Hand-tracking implements it (pose/face could later).
- **`TemplateModule`** — `init(scene)`, `update(states, dt)`, `dispose()`. The L-system plant implements it; a second generative template should be addable as one new file without touching `main.ts`'s loop.
- `HandState` = `{ id, x, y, pinch, landmarks }` — stable id, pinch-midpoint position (scene coords, mirrored), pinch openness 0–1, and the 21 landmarks for the skeleton.

File map:
```
index.html                     Vite entry, canvas mount + UI
src/main.ts                    orchestration: camera, scene/renderer, bloom, loop, template registry
src/types.ts                   HandState, InteractionSource, TemplateModule
src/hand/hand-tracking.ts      MediaPipe HandLandmarker, smoothing, nearest-neighbor stable IDs
src/hand/hand-skeleton.ts      glowing 21-landmark overlay, rebuilt per frame
src/lsystem/lsystem.ts         pure: axiom+rules → turtle → { segments[], flowers[] } with birth∈[0,1]
src/lsystem/lsystem.test.ts    Vitest
src/plant/plant.ts             TemplateModule: growable plant (LineSegments + growth shader) + tip flowers
src/plant/plant-manager.ts     Map<handId, plant> lifecycle: create/grow/move/fade-out
src/recorder.ts                MediaRecorder wrapper (webm, download)
```

## Key implementation notes
- **Scene coords:** orthographic `[-1,1]` frustum on the XY plane, so hand coords ([-1,1], mirrored) map 1:1 into world space — no per-frame projection math.
- **Single canvas:** the webcam is a `VideoTexture` on a background plane *inside* the three.js scene (not a separate DOM `<video>`), so there's one canvas to `captureStream` when recording.
- **Pinch:** `pinch = normalize( dist(landmark#4, landmark#8) / handSize )`, where `handSize = dist(#0, #9)` for scale-invariance. Plant root = midpoint of #4/#8.
- **Growth:** generate the L-system once to a fixed depth; each segment carries a normalized `birth` (path-distance from root). A `uGrowth` uniform reveals segments where `birth <= uGrowth` (`discard` in the fragment shader) — smooth growth in one draw call. Flowers scale in as growth passes their birth. Ease growth toward the pinch target, don't snap.
- **Stable hand IDs:** MediaPipe's per-frame order isn't stable — match detections to the previous frame's hands by nearest palm position (greedy NN is enough for 2 hands); unmatched beyond a threshold = new hand; a hand gone >500ms fades its plant out, doesn't snap it away.
- If a MediaPipe model URL or API surface looks off, check current Tasks Vision docs rather than guessing — the API has shifted across versions. Model: `hand_landmarker.task` from Google's hosted URL.

## How we build (workflow)
- Work in **4 parts, each on its own branch off `main`** (`feat/1-foundation` → `feat/2-hand-skeleton` → `feat/3-lsystem-plants` → `feat/4-glow-record-deploy`). Build, then verify, then merge to `main` so `main` always runs.
- **Verify before declaring done, and show it.** For rendering, use the Playwright headless harness (fake camera + an injectable `window.__bloomDebug.forceStates` hook in the loop) to screenshot the actual output — remove the debug hook before finishing a part. For pure logic, Vitest.
- Camera needs a real origin (the dev server), not `file://`.
- Commit messages end with the `Co-Authored-By` trailer; keep `main` green (`npm run build` + `npm test`).

## Scope discipline
- v1 = this experience, polished. Don't add: a template-picker UI, a second actual template, user accounts, a sharing gallery, mobile/non-Chrome support, any backend, analytics, or a config/manifest system for templates.
- If the two interfaces start growing past 2–3 methods, or the L-system/pinch tuning starts ballooning, stop and reconsider rather than over-building.
- When something's ambiguous, make the simplest choice that ships, note the assumption in a comment, and keep moving.
