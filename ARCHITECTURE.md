# Architecture & Build Spec

## Guiding principle
Zero build step, zero backend, zero dependencies to install. Everything runs from a single static folder, deployable by dragging it onto Netlify. This is the fastest path to a shippable v1 — but v1 now also needs to be *extensible*, so the two interfaces below exist from day one even though only one template and one interaction source are built right now.

## Extensibility model (new — this is what makes "versatile, eventually" cheap later)
Keep both interfaces small. The goal is a seam, not a framework — if either interface grows past 3 methods, it's over-engineered for what we need today.

**`TemplateModule` interface** — any visual effect (flower today, shapes/particles later) implements:
```js
{
  init(scene),                 // add its objects to the shared three.js scene, called once
  update(interactionStates),   // called every frame with an array of active interaction states (see below)
  dispose()                    // remove its objects from the scene, called on template switch (unused in v1 but must exist)
}
```

**`InteractionSource` interface** — any input method (hand-tracking today, pose/face later) implements:
```js
{
  init(videoElement),          // set up the model, called once
  getStates(timestamp),        // returns an array of { id, x, y, openness, ...} for currently active inputs
}
```
`hand-tracking.js` becomes the first implementation of this interface. `flower-manager.js` becomes the glue that calls `interactionSource.getStates()` each frame and passes the result into the active `TemplateModule.update()`.

**Template registry** — `main.js` holds a simple object/array of available templates (just one entry for v1: the flower) and calls `init()`/`update()`/`dispose()` on whichever is "active." No UI to switch templates yet — the registry existing is what matters, so adding entry #2 later doesn't require touching `main.js`'s loop.

Do not build: a config system, a manifest format, dynamic template loading from URLs, or anything else beyond these two plain interfaces and a one-item registry. That's scope creep in the other direction.


## Tech stack
| Layer | Choice | Why |
|---|---|---|
| UI | Plain HTML/CSS/JS | No framework overhead, no build tool, edits are instant |
| Hand tracking | MediaPipe Tasks Vision (`@mediapipe/tasks-vision`), loaded via CDN ESM import | Runs fully client-side (privacy story: camera never leaves device), no install |
| Rendering | three.js, loaded via CDN ESM import (`three` + `three/examples/jsm/postprocessing/*` if bloom is used) | WebGL scene graph makes multi-flower instancing and real glow/bloom postprocessing far easier than Canvas2D |
| Recording | `canvas.captureStream()` on the three.js renderer's canvas + `MediaRecorder` API | Native browser APIs, no library needed |
| Hosting | Vercel | Connect the repo, no build command needed — it's a static folder |

No `package.json`, no npm install, no bundler. CDN `<script type="module">` imports only.

## File structure
```
/index.html         — page shell, video background, permission UI, record UI, three.js canvas mount point
/style.css           — layout, full-viewport video/canvas, button styling
/main.js             — orchestration: camera setup, three.js scene/renderer setup, template registry, animation loop
/interaction-source.js — defines the InteractionSource interface (JSDoc/comment contract, no enforcement needed for v1)
/hand-tracking.js    — MediaPipe HandLandmarker wrapper (numHands: 2), stable per-hand ID assignment; implements InteractionSource
/template.js         — defines the TemplateModule interface (JSDoc/comment contract)
/templates/flower.js — flower factory implementing TemplateModule: builds/updates/disposes THREE.Group instances (petals + stem) per active hand
/flower-manager.js   — internal to the flower template: owns the Map<handId, flowerInstance>, handles create/fade-out-on-loss (this is template-internal state, not part of the core interfaces)
/recorder.js          — MediaRecorder wrapper: start/stop/download
```

## Data flow
1. `main.js` requests camera via `getUserMedia`, pipes stream into a hidden `<video>` element (mirrored via CSS `transform: scaleX(-1)`) which also serves as the visible background.
2. On each `requestAnimationFrame`:
   - `hand-tracking.js` runs `HandLandmarker.detectForVideo(videoEl, timestamp)`
   - Raw landmarks are smoothed (lerp toward previous frame values, ~0.2 factor) to kill jitter
   - Compute two derived values:
     - **openness** (0–1): normalized distance between fingertip landmarks and the palm center, scaled against a calibrated min/max
     - **position**: palm-center landmark (index 9) mapped from normalized [0,1] video coords to canvas pixel coords (remember to mirror X to match the mirrored video)
   - `flower.js` receives `{ x, y, openness }` and updates internal bloom state (ease toward target openness rather than snapping, for a organic feel)
   - Canvas is cleared and the flower is redrawn on top of the (already-visible) mirrored video
3. Record button calls `recorder.js.start(canvasStream)`; Stop button calls `.stop()`, which produces a Blob and injects a download link into the DOM.

## Hand tracking details (concrete, so Claude Code doesn't guess)
- Use `HandLandmarker` from `@mediapipe/tasks-vision`, model: `hand_landmarker.task` (loaded from Google's hosted model URL — check current CDN path at build time, it changes; search if unsure)
- `numHands: 2` — track up to two hands (one person, both hands)
- `runningMode: "VIDEO"`
- Openness calc: average distance from landmarks 8, 12, 16, 20 (fingertips) to landmark 0 (wrist), normalized by hand size (distance from landmark 0 to landmark 9) to be scale-invariant across distance-from-camera
- **Stable per-hand assignment (important, easy to get wrong):** MediaPipe's per-frame detection array order is not guaranteed to correspond to the same physical hand across frames. Each frame, match new detections to the previous frame's tracked hands by nearest palm-center position (simple greedy nearest-neighbor is enough for 2 hands — no need for a real tracking algorithm). Assign a stable internal ID per matched hand; a detection that doesn't match anything within a distance threshold is a new hand.
- If a tracked hand disappears for >500ms: mark it lost, trigger its flower's fade-out, then remove it — don't just snap it away
- If no hands at all are detected: no flowers render (or optionally one idle placeholder bud — keep simple, skip unless time allows)

## Flower rendering approach (multi-instance, three.js)
- NOT a full L-system for today — use a parametric radial petal design, built as a reusable `THREE.Group` factory so multiple independent instances can exist:
  - 6–8 petals as slightly-curved `PlaneGeometry` (bend via vertex displacement or a low-poly curved shape), arranged radially around the group's origin
  - Petal length and spread angle driven by that flower's `openness` (0 = folded/closed, 1 = fully spread) — animate with easing, not a snap
  - Emissive material color for a glow look even without postprocessing; subtle hue drift over time per flower for polish
  - Stem: a thin curved mesh (e.g. `TubeGeometry` along a quadratic curve) from the bottom of the view to the flower's position
  - Optional stretch: add `UnrealBloomPass` postprocessing for real bloom glow — implement last, cut first if it costs framerate with 2 flowers active
- `flower-manager.js` owns a `Map<handId, flowerInstance>`, creating/fading/destroying instances as `hand-tracking.js` reports hands appearing and disappearing
- This is intentionally simpler than true L-systems — ships today. True L-system geometry is a v2 enhancement.

## Recording details
- `canvas.captureStream(30)` (30fps) called on the three.js `WebGLRenderer`'s canvas (`renderer.domElement`) — note the video background and the WebGL flower canvas are separate elements; if you want both in the recording, either composite them onto one canvas before capture, or render the mirrored video as a background texture inside the three.js scene itself (simpler — recommended: draw the `<video>` element as a full-screen background plane/texture in the three.js scene so there's only one canvas to capture)
- `MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })` — fall back to `video/webm` if vp9 unsupported
- On `stop`, assemble `Blob` from chunks, `URL.createObjectURL`, set as `<a download="bloom.webm">` href
- Known limitation: Safari has poor `MediaRecorder`/webm support — out of scope, Chrome desktop only for v1

## Performance notes
- Run hand detection every frame first; if frame time budget is tight, detection can be throttled to every 2nd frame while still rendering the flower every frame (interpolate between detections) — only implement this if v1 testing shows lag, don't pre-optimize
- Keep canvas resolution matched to viewport, avoid unnecessary offscreen canvases for v1

## Deployment
- No build step required — the folder itself is the deployable artifact
- On Vercel: import the GitHub repo, framework preset "Other" (no build command, no output directory override needed since `index.html` is at the root)
- For local testing before pushing: `npx serve` (camera access needs a proper origin, not `file://`)
