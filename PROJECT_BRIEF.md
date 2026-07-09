# Bloom — Project Brief

## 1. What it is
A webcam-reactive generative-art playground for the browser. You see your hands tracked live as a glowing, role-tinted skeleton, and your two hands **together grow and bloom one floating L-system bouquet** — one hand grows it, the other blooms it, and moving your hands carries it around the screen. No install, no login, fully client-side — a "TouchDesigner + MediaPipe" moment of delight that anyone can get in seconds.

## 2. Who it's for
- Primary: anyone with a laptop + webcam who wants a quick, shareable moment of playful generative art — no technical skill required.
- Secondary: future-me, who wants to keep adding generative templates and interaction modes on top of a clean seam.

## 3. Why it's different
Existing camera-reactive flower/gesture demos (GestureFlower, Gesture-Particles, etc.) are single-effect, single-hand, gesture-switching, no recording. Bloom differentiates on: **live visible hand tracking** (a skeleton tinted by what each hand controls, with a live numeric label), **two-handed cooperative control** of one procedural L-system bouquet (grow vs. bloom as separate parameters, not one canned shape or one plant per hand), a **movable** piece that floats with your hands, **recording/export**, and **bloom-glow visual polish** — on an architecture where adding a new generative template is a one-file change.

## 4. MVP scope (current)
**In:**
- Mirrored, dimmed live webcam background (inside the three.js scene).
- Live glowing 21-landmark hand skeleton overlay per hand, tinted by role (Grow = green, Bloom = gold) with a live "Grow: n.nn" / "Bloom: n.nn" label.
- **One shared L-system bouquet** (upright V/funnel shape, curved organic stems, multicolor flowers, a bloom at every branch tip) driven by two hands:
  - The hand assigned **Grow** (by MediaPipe handedness, left-side fallback) eases the plant's growth (stems reveal, buds appear).
  - The hand assigned **Bloom** eases the buds open into full flowers.
  - The bouquet **floats** to the midpoint of the present hands; with one hand it follows that hand.
  - With **no hands**, grow & bloom ease back to 0 and the bouquet recedes rather than lingering.
- Bloom (glow) postprocessing, tuned so flowers stay legible.
- Record → stop → download a `.webm` clip (skeleton + labels included).
- Two small extensibility interfaces (`InteractionSource`, `TemplateModule`) so a second template/interaction mode is cheap later.

**Out (future work, enabled but not built):** a second actual template, a template-picker UI, >2 hands / multi-person, pose/face interaction modes, deep per-plant customization UI, mobile/non-Chrome support, accounts, sharing gallery, any backend, any analytics.

## 5. Definition of done
- Deployed to a public Vercel URL, works in Chrome desktop.
- Camera on → both hands tracked live (role-tinted skeletons + labels visible) → one hand grows, the other blooms, the bouquet follows your hands around the screen → record → download plays back.
- Degrades gracefully with zero or one hand (recedes / holds the other parameter, respectively); no console errors.
- A developer could add a second generative template by writing one file that implements `TemplateModule`, without editing `main.ts`'s loop.

## 6. Risks
- Over-engineering the extensibility layer — keep both interfaces to 2–3 methods.
- L-system growth/perf, pinch-mapping, and role-assignment tuning eating time — keep it simple, cut scope before over-building.
- Two hands close together or occluding each other can still confuse MediaPipe's per-frame detection (handedness helps, isn't a full fix). Tracking jitter in poor lighting; low-end GPU perf with bloom — accepted, cut bloom if it costs framerate.
- **This project's interaction model and visual style have iterated a lot** (see `CLAUDE.md`'s scope-discipline note) — don't assume a past description is still current.

See `ARCHITECTURE.md` for the technical approach and `CLAUDE.md` for build workflow and conventions.
