# Bloom — Webcam-Reactive Generative Art (Extensible Platform, v1: Multi-Hand Flower)

## 1. Problem Statement
Generative, camera-reactive visual art (à la TouchDesigner + MediaPipe) is delightful but locked behind technical setup. Existing browser-based attempts at this (see Current Alternatives) are single-purpose demos — one effect, one interaction mode, no room to grow, no recording. This project builds a genuinely better version: architected so new templates and interaction modes can be added over time, while still shipping a real, polished v1 in days.

## 2. Target Users
- Primary: anyone with a laptop and webcam who wants a moment of delight — friends, social media viewers, no technical skill required
- Secondary (new): future-you, who wants to keep adding templates without rewriting the core each time

## 3. Current Alternatives (researched)
- **GestureFlower** (Seek4AI): hand-openness controls a single flower's bloom. Single hand, single template, no recording.
- **Bloom — Gesture Recognition** (Prasiddhi16): gesture-triggered flower blooms plus other effects; own roadmap explicitly lists multi-hand support as not-yet-built.
- **Gesture-Particles** (Krishna71340): the strongest existing competitor — MediaPipe + Three.js, multiple gesture-triggered shapes (sphere, Saturn, flower, heart), but one active shape/gesture at a time, no simultaneous multi-person state, no recording.

**Our differentiation:** simultaneous independent multi-hand/multi-person interaction (not gesture-switching one shape at a time), recording/export, higher visual polish (bloom postprocessing), and an architecture that makes adding templates cheap over time — none of the above have all of these.

## 4. Why This Matters
Two goals now, both legitimate: (a) a delightful, shareable experience for the person trying it, (b) a system worth being proud of and easy to keep building on. Success = a stranger gets it in under 10 seconds, has a moment of delight, records a clip — AND the codebase makes adding a second template a same-day task, not a rewrite.

## 5. MVP Scope — v1, still shippable in days
**In scope:**
- Two small extensibility interfaces (`TemplateModule`, `InteractionSource`) that the flower template and hand-tracking are built against — see ARCHITECTURE.md
- One polished template: flowers that bloom and follow hands, one flower per hand, up to 2 (one person, both hands)
- Webcam permission → live mirrored video background (three.js scene background)
- Record button → stop → download a video clip (webm)
- A minimal template registry (even with just one entry) so the switching mechanism exists structurally
- Single static page, no backend, no login, no build step (three.js + MediaPipe loaded via CDN ESM imports)

**Explicitly OUT of scope for v1 (future work, enabled but not built now):**
- A second template (shapes, particles, patterns) — architecture supports it, not building it yet
- More than 2 tracked hands / multiple people in frame
- Pose or face tracking as additional interaction modes
- Deep per-template customization UI (colors, species, physics presets)
- Node graph / custom programming for end users
- Mobile optimization, accounts, sharing gallery, non-Chrome support
- Monetization of any kind

## 6. Definition of Done (v1)
- [ ] Deployed to a public static URL (Vercel)
- [ ] Works in Chrome desktop: camera on → hands tracked independently → flowers bloom/follow → record → download plays back correctly
- [ ] Degrades gracefully with zero or one hand
- [ ] A developer (you, or Claude Code) could add a second template by writing one new file implementing `TemplateModule`, without modifying `main.js`'s core loop — this is the actual test of "done properly"
- [ ] Sent to 3+ friends for a real reaction

## 7. Risks
- Over-engineering the extensibility layer is the new failure mode — keep both interfaces to 2-3 methods each, resist adding configuration nobody's asked for yet
- Gesture-Particles is a real, already-shipped competitor with template-switching — "versatile" needs to visibly exceed it, not just match it
- Performance on low-end laptops; tracking jitter in bad lighting — same as before, accepted for v1

## 8. Next Steps After v1
1. Send to friends, watch real reactions
2. Add template #2 (a shape or particle effect) as the first real test of the extensibility architecture
3. Only then consider a second interaction mode (pose/face) or a template picker UI

