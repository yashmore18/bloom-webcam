# CLAUDE.md — Bloom

Bloom is a **webcam-reactive generative-art playground**: you see your hands tracked live as a glowing, role-colored skeleton, and together your two hands **grow and bloom a single floating L-system bouquet**. Think "TouchDesigner + MediaPipe, in the browser, but fun and immediate." Single-page, fully client-side, deployed as a static site on Vercel.

## Core experience (what "done" feels like)
- Open the page → grant camera → your mirrored (and dimmed) webcam fills the screen.
- Raise your hands → each gets a **glowing 21-point skeleton**, tinted by role, with a live label above the wrist: **"Grow: 0.46"** (green) or **"Bloom: 0.40"** (gold).
- One hand is **Grow**, the other is **Bloom** — assigned by which physical hand it is (MediaPipe handedness: Left→Grow, Right→Bloom), so the roles don't swap if your hands cross or get close.
- **Pinch** thumb + index on the Grow hand → an upright **V/funnel bouquet** (multicolor flowers on curved stems) grows from that hand's side, revealing stems and buds.
- **Pinch** on the Bloom hand → the buds **open** into full flowers.
- **Move your hands** → the whole bouquet **floats** to the midpoint between them (one hand present → it follows that hand).
- **Drop both hands** → grow & bloom ease back to 0 and the bouquet recedes/disappears (it doesn't linger).
- **Record** → grow/bloom the bouquet → **Stop** → download a `.webm` clip (the skeleton + labels are baked into the recording).

## Tech stack
- **Vite + TypeScript** — dev server with HMR, typed codebase, static prod build.
- **three.js** (npm) for WebGL rendering; imperative three.js, **not** React-Three-Fiber (this is a tight per-frame loop mutating GPU buffers from the detection callback).
- **@mediapipe/tasks-vision** (npm, pinned `0.10.35`) — `HandLandmarker`, `numHands: 2`, `runningMode: "VIDEO"`, `delegate: "GPU"`, client-side (camera never leaves the device). Also used for **handedness** (Left/Right per hand).
- **EffectComposer + UnrealBloomPass** for the glow aesthetic (softened strength so blooms stay legible, not washed out).
- **MediaRecorder + `canvas.captureStream`** for recording — no library.
- **Vitest** for pure-logic unit tests (the L-system, role assignment), **Playwright** headless for render verification.
- Deploy: **Vercel** (Vite preset, output `dist/`).

## Commands
- `npm run dev` — dev server at http://localhost:5173 (HMR; you rarely need to hard-refresh).
- `npm run build` — typecheck (`tsc --noEmit`) + `vite build` to `dist/`.
- `npm test` — Vitest. `npm run typecheck`, `npm run lint`.

## Architecture & extensibility
Two small interfaces (in `src/types.ts`) keep the seam clean — keep each to **2–3 methods**; richer per-frame data rides inside `HandState`, not in extra methods.
- **`InteractionSource`** — `init(video)`, `getStates(timestamp) → HandState[]`. `HandTracking` implements it.
- **`TemplateModule`** — `init(scene)`, `update(states, dt)`, `dispose()`. `PlantTemplate` (the single bouquet) implements it; a second generative template should be addable as one new file without touching `main.ts`'s loop.
- `HandState` = `{ id, x, y, pinch, landmarks, handedness? }` — stable id, pinch-midpoint position (scene coords, mirrored), pinch openness 0–1, the 21 landmarks for the skeleton, and MediaPipe's Left/Right label when confident.
- `HandRole = "grow" | "bloom"` (in `src/types.ts`) — computed per-frame by `src/hand/roles.ts`, consumed by both `plant-manager.ts` and `hand-skeleton.ts` so the plant and the skeleton tint/label agree.

File map:
```
index.html                     Vite entry, canvas mount + UI
src/main.ts                    orchestration: camera, scene/renderer, bloom composer, loop, template registry
src/types.ts                   HandState, Handedness, HandRole, InteractionSource, TemplateModule
src/hand/hand-tracking.ts      MediaPipe HandLandmarker, smoothing, handedness-aware stable IDs, pinch
src/hand/roles.ts              assigns Grow/Bloom per hand (handedness, falls back to screen-side)
src/hand/hand-skeleton.ts      glowing 21-landmark overlay, tinted by role + live "Grow/Bloom: n.nn" label
src/lsystem/lsystem.ts         pure: axiom+rules → turtle (with organic curl) → { segments[], flowers[] }, birth∈[0,1]
src/lsystem/lsystem.test.ts    Vitest
src/plant/plant.ts             renders one plant: thick growable stem (shader reveal) + flowers (bud→bloom)
src/plant/plant-manager.ts     TemplateModule: ONE shared plant, floats to hands' midpoint, grow/bloom from roles
src/hand/roles.test.ts         Vitest for role assignment
src/recorder.ts                MediaRecorder wrapper (webm, download)
```

## Key implementation notes
- **Scene coords:** orthographic `[-1,1]` frustum on the XY plane, so hand coords ([-1,1], mirrored) map 1:1 into world space — no per-frame projection math.
- **Single canvas:** the webcam is a dimmed `VideoTexture` on a background plane *inside* the three.js scene (not a separate DOM `<video>`), so there's one canvas to `captureStream` when recording, and the video sits below the bloom threshold so only the glowing plant/skeleton pop.
- **Pinch:** `pinch = normalize( dist(landmark#4, landmark#8) / handSize )`, where `handSize = dist(#0, #9)` for scale-invariance; range tuned (`PINCH_MIN 0.2` / `PINCH_MAX 0.9`) so a moderate spread reaches full value, not an extreme stretch.
- **One shared plant, two-hand control:** `plant-manager.ts` owns a single `PlantVisual`. Each frame, `assignRoles()` picks which tracked hand is Grow vs Bloom; that hand's `pinch` eases the plant's `grow`/`bloom` targets. **While ≥1 hand is present**, a role with no hand holds its last value (one-handed control doesn't reset the other side). **With 0 hands**, both ease to 0 so the plant recedes.
- **Movable:** the plant's position eases toward the average `(x,y)` of the present hands (a small downward offset keeps the base below the hands), and **holds** when no hands are present.
- **Role assignment (`roles.ts`):** prefers MediaPipe **handedness** (Left→Grow, Right→Bloom) so roles stay correct even if hands cross/get close; falls back to screen-side (left-most hand = Grow) only if handedness is missing or both hands report the same label.
- **Growth:** the L-system (`lsystem.ts`) is a symmetric **monopodial** rule (`X → F[+X][-X]FX`) — a central leader plus mirrored side branches, forming an upright V/funnel bouquet with no sideways lean. Each `F` step is drawn as several sub-segments with a damped random heading drift + an up-righting bias, so stems curve organically without wandering off-axis. Each segment/flower carries a normalized `birth` (path-distance from root), **capped below 1** (`BIRTH_MAX`) — `grow` only *approaches* 1 asymptotically, so births must top out lower or the outermost tips could never fully reveal/flower.
- **Rendering:** stems are a single indexed triangle-strip **mesh** (quad ribbons with real width, not a 1px `LineSegments`) with a per-vertex `birth` attribute; a `uGrowth` uniform `discard`s stem past the reveal point — one draw call, smooth growth. Flowers are a shared 6-lobe rosette shape; `grow` gates whether a flower has appeared (as a small bud), `bloom` opens bud→full.
- **Stable hand IDs:** MediaPipe's per-frame order isn't stable — match detections to the previous frame's hands by nearest palm position, with same-handedness pairs preferred (soft tiebreak, not a hard requirement); unmatched beyond a threshold = new hand; a hand gone >500ms is dropped.
- If a MediaPipe model URL, WASM version, or API surface looks off, check current Tasks Vision docs rather than guessing — the API has shifted across versions, and the npm package version must match the CDN-hosted WASM version.

## How we build (workflow)
- Small changes on a short-lived branch off `main`; build, verify, merge, push (Vercel auto-deploys). For larger efforts, split into stages/parts the same way.
- **Verify before declaring done, and show it.** For rendering, use the Playwright headless harness (fake camera + an injectable `window.__bloomDebug.forceStates` hook in the loop, dev-only via `import.meta.env.DEV`) to screenshot the actual output. For pure logic (L-system, role assignment), Vitest.
- Camera needs a real origin (the dev server), not `file://`.
- Commit messages end with the `Co-Authored-By` trailer; keep `main` green (`npm run build` + `npm test`).

## Scope discipline
- v1 = this experience, polished. Don't add: a template-picker UI, a second actual template, user accounts, a sharing gallery, mobile/non-Chrome support, any backend, analytics, or a config/manifest system for templates.
- If the two interfaces start growing past 2–3 methods, or the L-system/pinch/role tuning starts ballooning, stop and reconsider rather than over-building.
- When something's ambiguous, make the simplest choice that ships, note the assumption in a comment, and keep moving.
- **This project's design has changed direction several times** (per-hand plants → shared plant, screen-side roles → handedness roles, fixed position → movable, sunflower ↔ lily ↔ multicolor rosette, etc.). Don't assume an old description (in git history, prior conversation, or stale docs) is still current — read the actual source before describing or changing behavior.
