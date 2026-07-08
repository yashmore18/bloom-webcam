import * as THREE from "three";
import type { HandState, TemplateModule } from "../types";
import { generatePlant } from "../lsystem/lsystem";
import { createPlantVisual, type PlantVisual } from "./plant";

// TemplateModule: one L-system plant per tracked hand. Growth eases toward the
// hand's pinch value; the plant sits at the pinch midpoint and sways gently.
// A hand that disappears fades its plant out before it is disposed.

const GROWTH_EASE = 0.14; // ease growth toward pinch target (no snapping)
const FADE_DURATION = 0.4; // seconds
const SWAY_AMPLITUDE = 0.05; // radians
const SWAY_SPEED = 1.3;
const PLANT_HEIGHT = 1.1;

interface Entry {
  visual: PlantVisual;
  growth: number;
  phase: "active" | "fading";
  fade: number; // 0..1 fade progress while phase === "fading"
  swayPhase: number;
}

export class PlantTemplate implements TemplateModule {
  private scene!: THREE.Scene;
  private plants = new Map<number, Entry>();
  private time = 0;

  init(scene: THREE.Scene): void {
    this.scene = scene;
  }

  update(states: HandState[], dt: number): void {
    this.time += dt;
    const seen = new Set<number>();

    for (const state of states) {
      seen.add(state.id);
      let entry = this.plants.get(state.id);
      if (!entry) entry = this.spawn(state.id);

      entry.phase = "active";
      entry.fade = 0;
      entry.growth += (state.pinch - entry.growth) * GROWTH_EASE;
      entry.visual.setGrowth(entry.growth);
      entry.visual.setPosition(state.x, state.y);
      entry.visual.setSway(Math.sin(this.time * SWAY_SPEED + entry.swayPhase) * SWAY_AMPLITUDE);
      entry.visual.setOpacity(1);
    }

    for (const [id, entry] of this.plants) {
      if (seen.has(id)) continue;
      entry.phase = "fading";
      entry.fade += dt / FADE_DURATION;
      entry.visual.setOpacity(Math.max(0, 1 - entry.fade));
      if (entry.fade >= 1) {
        this.scene.remove(entry.visual.group);
        entry.visual.dispose();
        this.plants.delete(id);
      }
    }
  }

  dispose(): void {
    for (const entry of this.plants.values()) {
      this.scene.remove(entry.visual.group);
      entry.visual.dispose();
    }
    this.plants.clear();
  }

  private spawn(id: number): Entry {
    // Per-hand seed & hue so the two plants differ.
    const geometry = generatePlant({ iterations: 3, seed: id * 1013 + 7, targetHeight: PLANT_HEIGHT });
    const visual = createPlantVisual(geometry, (id * 0.17) % 1);
    this.scene.add(visual.group);
    const entry: Entry = {
      visual,
      growth: 0,
      phase: "active",
      fade: 0,
      swayPhase: (id * 1.7) % (Math.PI * 2),
    };
    this.plants.set(id, entry);
    return entry;
  }
}
