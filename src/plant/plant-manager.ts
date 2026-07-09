import * as THREE from "three";
import type { HandState, TemplateModule } from "../types";
import { assignRoles } from "../hand/roles";
import { createSunflower, type Sunflower } from "./sunflower";

// TemplateModule: one shared sunflower, fixed at bottom-center. Two hands drive
// it — the Grow-role hand's pinch eases the `grow` parameter (stem + head), the
// Bloom-role hand's pinch eases `bloom` (petal openness). A parameter whose
// role hand is absent simply holds its last value.

const EASE = 0.15;

export class SunflowerTemplate implements TemplateModule {
  private scene!: THREE.Scene;
  private flower!: Sunflower;
  private grow = 0;
  private bloom = 0;

  init(scene: THREE.Scene): void {
    this.scene = scene;
    this.flower = createSunflower();
    this.scene.add(this.flower.group);
  }

  update(states: HandState[], _dt: number): void {
    const roles = assignRoles(states);
    let growTarget = this.grow; // default: hold
    let bloomTarget = this.bloom;
    for (const s of states) {
      const role = roles.get(s.id);
      if (role === "grow") growTarget = s.pinch;
      else if (role === "bloom") bloomTarget = s.pinch;
    }
    this.grow += (growTarget - this.grow) * EASE;
    this.bloom += (bloomTarget - this.bloom) * EASE;
    this.flower.setGrow(this.grow);
    this.flower.setBloom(this.bloom);
  }

  dispose(): void {
    this.scene.remove(this.flower.group);
    this.flower.dispose();
  }
}
