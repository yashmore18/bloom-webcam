import * as THREE from "three";
import type { HandState, TemplateModule } from "../types";
import { assignRoles } from "../hand/roles";
import { generatePlant } from "../lsystem/lsystem";
import { createPlantVisual, type PlantVisual } from "./plant";

// TemplateModule: one shared L-system plant, fixed at bottom-center, growing up.
// Two hands drive it — the Grow-role hand's pinch eases the `grow` parameter
// (stems reveal + flower buds appear), the Bloom-role hand's pinch eases
// `bloom` (buds open into full flowers). A parameter whose role hand is absent
// holds its last value.

const EASE = 0.14; // ease grow/bloom toward pinch targets (no snapping)
const SWAY_AMPLITUDE = 0.04; // radians
const SWAY_SPEED = 1.3;
const PLANT_HEIGHT = 1.1;
const ANCHOR_Y = -0.85; // root near the bottom of the frustum

export class PlantTemplate implements TemplateModule {
  private scene!: THREE.Scene;
  private plant!: PlantVisual;
  private grow = 0;
  private bloom = 0;
  private time = 0;

  init(scene: THREE.Scene): void {
    this.scene = scene;
    const geometry = generatePlant({ iterations: 4, seed: 12345, targetHeight: PLANT_HEIGHT });
    this.plant = createPlantVisual(geometry, 0);
    this.plant.setPosition(0, ANCHOR_Y);
    this.scene.add(this.plant.group);
  }

  update(states: HandState[], dt: number): void {
    this.time += dt;
    const roles = assignRoles(states);

    // While ≥1 hand is present, an absent role holds its last value (so
    // one-handed control doesn't reset the other). With NO hands at all, both
    // recede to 0 so the plant disappears rather than lingering fully bloomed.
    const noHands = states.length === 0;
    let growTarget = noHands ? 0 : this.grow;
    let bloomTarget = noHands ? 0 : this.bloom;
    for (const s of states) {
      const role = roles.get(s.id);
      if (role === "grow") growTarget = s.pinch;
      else if (role === "bloom") bloomTarget = s.pinch;
    }

    this.grow += (growTarget - this.grow) * EASE;
    this.bloom += (bloomTarget - this.bloom) * EASE;
    this.plant.setGrow(this.grow);
    this.plant.setBloom(this.bloom);
    this.plant.setSway(Math.sin(this.time * SWAY_SPEED) * SWAY_AMPLITUDE);
  }

  dispose(): void {
    this.scene.remove(this.plant.group);
    this.plant.dispose();
  }
}
