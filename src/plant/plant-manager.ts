import * as THREE from "three";
import type { HandState, TemplateModule } from "../types";
import { assignRoles } from "../hand/roles";
import { generatePlant } from "../lsystem/lsystem";
import { createPlantVisual, type PlantVisual } from "./plant";

// TemplateModule: one shared L-system plant that floats to the midpoint of the
// hands and grows upward from there. Two hands drive it — the Grow-role hand's
// pinch eases `grow` (stems reveal + flower buds appear), the Bloom-role hand's
// pinch eases `bloom` (buds open). An absent role's parameter holds its last
// value while ≥1 hand is present; with no hands, grow & bloom ease to 0 (the
// plant recedes) and the position holds.

const EASE = 0.14; // ease grow/bloom toward pinch targets (no snapping)
const POS_EASE = 0.15; // ease plant position toward the hands' midpoint
const SWAY_AMPLITUDE = 0.04; // radians
const SWAY_SPEED = 1.3;
const PLANT_HEIGHT = 0.65; // compact bouquet (shorter stem)
const BASE_OFFSET_Y = -0.35; // base sits below the hands so blooms rise around them
const START_Y = -0.85;

export class PlantTemplate implements TemplateModule {
  private scene!: THREE.Scene;
  private plant!: PlantVisual;
  private grow = 0;
  private bloom = 0;
  private time = 0;
  private posX = 0;
  private posY = START_Y;

  init(scene: THREE.Scene): void {
    this.scene = scene;
    const geometry = generatePlant({ iterations: 4, seed: 4, targetHeight: PLANT_HEIGHT });
    this.plant = createPlantVisual(geometry, 0);
    this.plant.setPosition(this.posX, this.posY);
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

    // Float toward the midpoint of the present hands (hold position if none).
    if (!noHands) {
      let mx = 0;
      let my = 0;
      for (const s of states) {
        mx += s.x;
        my += s.y;
      }
      mx /= states.length;
      my /= states.length;
      this.posX += (mx - this.posX) * POS_EASE;
      this.posY += (my + BASE_OFFSET_Y - this.posY) * POS_EASE;
    }

    this.plant.setGrow(this.grow);
    this.plant.setBloom(this.bloom);
    this.plant.setPosition(this.posX, this.posY);
    this.plant.setSway(Math.sin(this.time * SWAY_SPEED) * SWAY_AMPLITUDE);
  }

  dispose(): void {
    this.scene.remove(this.plant.group);
    this.plant.dispose();
  }
}
