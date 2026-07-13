# 🌸 Bloom

A **webcam-reactive generative-art playground** — open the app, raise your hands, and watch them transform into a glowing skeleton that grows and blooms a procedural L-system bouquet in real time. Two hands, two roles: one hand grows the plant, the other opens the flowers. Move your hands to carry the bouquet around the screen. Record your creation and download it as a video.

**Live:** [bloom.vercel.app](https://bloom.vercel.app)

## ✨ Features

- **Live hand tracking**: Your hands appear as a glowing 21-point skeleton, tinted by what they control
- **Two-handed control**: 
  - **Grow hand** (left) — pinch thumb + index to reveal stems and buds
  - **Bloom hand** (right) — pinch to open buds into full flowers
- **One shared bouquet**: An L-system plant that floats with your hands
- **Movable**: The bouquet follows the midpoint of your hands
- **Recording**: Capture and download `.webm` videos with the skeleton overlay baked in
- **Blooming glow**: Soft bloom postprocessing so the flowers pop against the dimmed webcam background
- **No install, no login**: Fully client-side, runs in your browser

## 🚀 Quick Start

1. **Open** [bloom.vercel.app](https://bloom.vercel.app) in Chrome
2. **Grant camera access** when prompted
3. **Raise your hands** — you'll see glowing skeletons with labels ("Grow" in green, "Bloom" in gold)
4. **Pinch on the Grow hand** → stems appear and buds grow
5. **Pinch on the Bloom hand** → buds open into flowers
6. **Move your hands** → the bouquet floats with you
7. **Record** → click Record, grow/bloom, then Stop → your video downloads

## 🎮 How to Use

### Hand Roles

**Left hand = Grow** (green tint, labeled "Grow")
- Pinch your thumb and index finger together
- Strength of pinch (0–1) controls how much the plant is revealed
- More pinch → stems reveal, buds appear

**Right hand = Bloom** (gold tint, labeled "Bloom")
- Pinch your thumb and index finger together
- Strength of pinch controls whether buds are closed (pinch released) or open (pinched)
- More pinch → flowers bloom (buds open into full 6-lobed flowers)

### Positioning

- The bouquet floats to the **midpoint between your two hands**
- With only one hand visible, it follows that hand
- When you lower both hands, the bouquet eases back down and disappears (it doesn't linger)

### Recording

1. Click the **Record** button (lower right)
2. Perform your grow/bloom sequence
3. Click **Stop** — your video downloads as `.webm`
4. The recording includes your skeleton and role labels

## 🛠️ For Developers

### Setup

```bash
git clone https://github.com/yashmore18/bloom-webcam.git
cd bloom-webcam
npm install
npm run dev
```

Open http://localhost:5173 in Chrome. HMR enabled — edit and see changes instantly.

### Build & Deploy

```bash
npm run build
```

This runs typechecks and builds to `dist/`. To preview locally:

```bash
npm run preview
```

**Deployment**: Push to `main` → Vercel auto-deploys `dist/` → live in seconds.

### Project Structure

```
src/
├── main.ts                 Orchestration: camera, renderer, scene, loop
├── types.ts                HandState, InteractionSource, TemplateModule interfaces
├── hand/
│   ├── hand-tracking.ts    MediaPipe HandLandmarker, pinch detection, stable IDs
│   ├── roles.ts            Assign Grow/Bloom to each hand (handedness-based)
│   └── hand-skeleton.ts    Render glowing 21-landmark skeleton + role labels
├── lsystem/
│   ├── lsystem.ts          Pure L-system expansion → turtle geometry
│   └── lsystem.test.ts     Unit tests
├── plant/
│   ├── plant.ts            Render stems (indexed mesh) and flowers
│   └── plant-manager.ts    TemplateModule: manage one shared plant
└── recorder.ts             MediaRecorder + downloadable .webm
```

For a detailed architecture overview, see [ARCHITECTURE.md](ARCHITECTURE.md).

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Build | Vite + TypeScript | Fast dev server (HMR), static prod build, type safety |
| Rendering | three.js + EffectComposer | WebGL scene graph, post-processing bloom |
| Hand Tracking | @mediapipe/tasks-vision | Client-side, privacy-preserving, includes handedness |
| Recording | canvas.captureStream + MediaRecorder | Native APIs, no dependencies |
| Testing | Vitest + Playwright | Unit tests + headless render verification |
| Hosting | Vercel | Static deployment, zero config |

### Testing

```bash
npm test                # Run Vitest (L-system, role logic)
npm run typecheck       # TypeScript type-checking
npm run lint            # ESLint
```

### Adding a New Template

The architecture supports swappable generative templates. To add a new one:

1. Create `src/templates/my-template.ts` implementing `TemplateModule`:

```typescript
import { TemplateModule, HandState } from '../types';
import * as THREE from 'three';

export class MyTemplate implements TemplateModule {
  private scene: THREE.Scene;
  
  init(scene: THREE.Scene): void {
    this.scene = scene;
    // Set up your geometry, materials, etc.
  }
  
  update(states: HandState[], dt: number): void {
    // Per-frame: read hand states, animate your template
  }
  
  dispose(): void {
    // Clean up resources
  }
}
```

2. In `src/main.ts`, swap the import:

```typescript
// import { PlantTemplate } from './plant/plant-manager';
import { MyTemplate } from './templates/my-template';

const template = new MyTemplate();
```

3. No other changes needed — the loop and hand tracking run unchanged.

See `src/plant/plant-manager.ts` for a complete example.

## 🌐 Browser Support

- **Chrome/Chromium 89+** (MediaPipe HandLandmarker, getUserMedia, ES2020)
- **Tested on**: Desktop (Windows, macOS, Linux)
- **Not supported**: Mobile, Safari (native implementation exists but not in scope), Firefox (GPU handedness model missing)

Graceful degradation: if camera access is denied or hands can't be tracked, the app shows the webcam and waits silently (no crash).

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Bug reports and feature ideas welcome! Keep in mind the [scope discipline](CLAUDE.md#scope-discipline) outlined in CLAUDE.md — we prioritize polish and clarity over adding new templates or interaction modes.

### Workflow

1. Create a branch off `main`
2. Make your changes; run `npm run build && npm test && npm run lint`
3. Commit (message should explain the *why*; sign with `Co-Authored-By: ...` if applicable)
4. Push and open a PR

See [CLAUDE.md](CLAUDE.md) for detailed development conventions and the project philosophy.

## 🎯 Scope

**In scope:**
- One procedural L-system bouquet with live two-handed control
- Live hand-tracking skeleton overlay with role-based tinting
- Recording/export to `.webm`
- Bloom glow postprocessing
- Clean extensibility seam for new templates

**Out of scope (enabled but not built):**
- Second generative template or interaction mode
- Template picker UI
- Multi-person or >2-hand tracking
- Mobile or non-Chrome support
- User accounts, sharing, or backend
- Analytics

## 📚 Further Reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — Technical deep dive: rendering, hand tracking, extensibility
- [CLAUDE.md](CLAUDE.md) — Development conventions, build workflow, project history
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — Product vision and risks

---

Made with 🌸 and three.js
