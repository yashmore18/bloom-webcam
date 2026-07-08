# Bloom — Project Brief

## 1. What it is
A webcam-reactive generative-art playground for the browser. You see your hands tracked live as a glowing skeleton, and you **pinch to grow procedural L-system plants** that bloom at their tips. No install, no login, fully client-side — a "TouchDesigner + MediaPipe" moment of delight that anyone can get in seconds.

## 2. Who it's for
- Primary: anyone with a laptop + webcam who wants a quick, shareable moment of playful generative art — no technical skill required.
- Secondary: future-me, who wants to keep adding generative templates and interaction modes on top of a clean seam.

## 3. Why it's different
Existing camera-reactive flower/gesture demos (GestureFlower, Gesture-Particles, etc.) are single-effect, single-hand, gesture-switching, no recording. Bloom differentiates on: **live visible hand tracking** (you see the skeleton), **direct pinch-to-grow control** of **procedural L-system plants** (not one canned shape), **simultaneous independent two-hand interaction**, **recording/export**, and **bloom-glow visual polish** — on an architecture where adding a new generative template is a one-file change.

## 4. MVP scope (v1)
**In:**
- Mirrored live webcam background (inside the three.js scene).
- Live glowing 21-landmark hand skeleton overlay, up to 2 hands.
- Pinch-to-grow L-system plants — one per hand — that grow/bloom with pinch spread, follow the hand, and fade out when the hand leaves.
- Bloom (glow) postprocessing.
- Record → stop → download a `.webm` clip.
- Two small extensibility interfaces (`InteractionSource`, `TemplateModule`) so a second template/interaction mode is cheap later.

**Out (future work, enabled but not built):** a second actual template, a template-picker UI, >2 hands / multi-person, pose/face interaction modes, deep per-plant customization UI, mobile/non-Chrome support, accounts, sharing gallery, any backend, any analytics.

## 5. Definition of done
- Deployed to a public Vercel URL, works in Chrome desktop.
- Camera on → hands tracked live (skeleton visible) → pinch grows/blooms plants that follow each hand independently → record → download plays back.
- Degrades gracefully with zero or one hand; no console errors.
- A developer could add a second generative template by writing one file that implements `TemplateModule`, without editing `main.ts`'s loop.

## 6. Risks
- Over-engineering the extensibility layer — keep both interfaces to 2–3 methods.
- L-system growth/perf and pinch-mapping tuning eating time — keep it simple, cut scope before over-building.
- Tracking jitter in poor lighting; low-end GPU perf with bloom + 2 plants — accepted for v1 (cut bloom if it costs framerate).

See `ARCHITECTURE.md` for the technical approach and `CLAUDE.md` for build workflow and conventions.
