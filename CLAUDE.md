# CLAUDE.md — Build Instructions

You are building **Bloom**, a single-page, zero-backend web app: a webcam-reactive flower that blooms and follows the user's hand, with record-and-download.

Read `PROJECT_BRIEF.md` and `ARCHITECTURE.md` in this folder first — they define scope and technical approach. Follow them precisely. Do not add features beyond MVP scope (no gallery, no multiple templates, no accounts, no backend).

## Build order (follow this sequence)
1. `index.html` + `style.css` — page shell: permission button, record/stop button, download link placeholder, three.js canvas mount point
2. `main.js` — camera permission flow, three.js scene/camera/`WebGLRenderer`, mirrored webcam as a background plane in the scene, a `requestAnimationFrame` loop with nothing else in it yet — verify you see your mirrored webcam before continuing
3. Write the two interface contracts as short comment blocks: `interaction-source.js` and `template.js` (see ARCHITECTURE.md for the exact shape). These are documentation, not enforced classes — keep them tiny.
4. `templates/flower.js` — build ONE static flower implementing `TemplateModule`, placed in the scene by hand, no tracking yet — verify it looks right and animates smoothly between a hardcoded closed/open state
5. `hand-tracking.js` — MediaPipe `HandLandmarker`, `numHands: 2`, nearest-neighbor stable ID assignment across frames, implements `InteractionSource` — verify with `console.log` that IDs stay stable as you move your hands, independent of the flower rendering
6. Wire `main.js`'s template registry: one entry (the flower template), calling `interactionSource.getStates()` each frame and passing results into the active template's `update()`. `flower-manager.js` (create/update/fade-out-on-loss per hand ID) lives inside the flower template's `update()`, not in `main.js`.
7. `recorder.js` — `MediaRecorder` wrapper on the three.js canvas, wired to record/stop buttons
8. (Stretch, only if time remains) `UnrealBloomPass` postprocessing — add last, remove immediately if it hurts framerate with 2 flowers active

Build and manually verify each step before moving to the next. Steps 3-4 (interfaces, then one static flower with no tracking) are deliberately before hand-tracking so interface design, geometry bugs, and tracking bugs are never debugged at the same time.

## Hard constraints
- No npm install, no bundler, no `package.json`. CDN ESM imports only.
- No backend, no server code, no API calls except loading the MediaPipe model from its CDN/hosted URL.
- Chrome desktop is the only supported target for v1 — don't spend time on Safari/mobile workarounds.
- If a MediaPipe model URL or API surface is unclear or may have changed, search for the current MediaPipe Tasks Vision documentation rather than guessing — the API has changed versions before.

## Acceptance criteria (test before declaring done)
- [ ] Opening `index.html` (served, not `file://`, since camera access needs a proper origin) prompts for camera permission
- [ ] After permission, mirrored webcam video is visible full-screen
- [ ] Moving a hand in frame moves its flower's position accordingly
- [ ] Opening/closing a hand blooms/closes its flower smoothly (no jarring snapping)
- [ ] Raising a second hand spawns a second, independent flower; each hand controls only its own flower
- [ ] A flower doesn't randomly jump/swap to the other hand when both are in frame (this is the nearest-neighbor ID assignment working correctly — test it deliberately by crossing your hands)
- [ ] Removing a hand from frame fades that flower out rather than snapping it away; no errors in console
- [ ] No hands in frame → no crash, no console errors
- [ ] Record → bloom one or two flowers → Stop → a working, downloadable webm file is produced and plays back correctly
- [ ] **Extensibility check:** could a second template be added by writing one new file in `templates/` implementing `TemplateModule`, without editing `main.js`'s render loop? If not, the interface boundary is wrong — fix it now, don't defer
- [ ] No console errors during normal use

## Explicitly do not build
Gallery/template picker UI, a second actual template, node-graph editor, user accounts, sharing features, mobile support, non-Chrome support, any backend/server, any analytics/tracking of users, a config/manifest system for templates, dynamic template loading from URLs. The `TemplateModule`/`InteractionSource` interfaces should stay to 2-3 methods each — if you find yourself adding more, stop and reconsider rather than expanding them.

## If something in the spec is ambiguous
Make the simplest choice that ships today, note the assumption in a code comment, and move on. Don't block progress on polish decisions (e.g., exact petal colors, exact easing curve) — get it working end-to-end first, refine after.
