import * as THREE from "three";
import type { HandState, HandRole, Landmark } from "../types";
import { assignRoles } from "./roles";

// MediaPipe hand landmark connectivity (21 points → 21 bones).
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm base
];

const LANDMARK_COUNT = 21;
const WRIST = 0;
const Z = 0.02; // just in front of the video background plane

// Tint each hand's skeleton + label by its role so you can see at a glance
// which hand grows and which blooms.
const ROLE_COLOR: Record<HandRole, number> = {
  grow: 0x39e08a, // green
  bloom: 0xffc23a, // gold
};
const ROLE_LABEL: Record<HandRole, string> = { grow: "Grow", bloom: "Bloom" };
const FALLBACK_COLOR = 0x9fe8ff; // used only before a role is assigned

// Landmarks arrive in normalized [0,1] image coords; mirror X and map to the
// scene's [-1,1] frustum to line up with the mirrored webcam.
function toScene(l: Landmark, out: THREE.Vector3): THREE.Vector3 {
  return out.set((1 - l.x) * 2 - 1, -(l.y * 2 - 1), Z);
}

/** Soft round sprite for joints so dots read as glowing points, not squares. */
function makeDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.Texture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface Slot {
  group: THREE.Group;
  bones: THREE.LineSegments;
  boneMat: THREE.LineBasicMaterial;
  joints: THREE.Points;
  jointMat: THREE.PointsMaterial;
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTexture: THREE.CanvasTexture;
  lastText: string;
}

/**
 * Draws a glowing 21-landmark skeleton for each active hand, tinted by role
 * (green = Grow, gold = Bloom) with a small live label ("Grow: 0.46"). Per-hand
 * buffers/materials are created once and updated each frame; slots for hands
 * that disappear are disposed.
 */
export class HandSkeleton {
  private scene!: THREE.Scene;
  private dotTexture!: THREE.Texture;
  private slots = new Map<number, Slot>();
  private tmp = new THREE.Vector3();

  init(scene: THREE.Scene): void {
    this.scene = scene;
    this.dotTexture = makeDotTexture();
  }

  update(states: HandState[]): void {
    const roles = assignRoles(states);
    const seen = new Set<number>();

    for (const state of states) {
      if (state.landmarks.length < LANDMARK_COUNT) continue;
      seen.add(state.id);
      let slot = this.slots.get(state.id);
      if (!slot) {
        slot = this.createSlot();
        this.slots.set(state.id, slot);
      }
      const role = roles.get(state.id);
      const color = role ? ROLE_COLOR[role] : FALLBACK_COLOR;
      slot.boneMat.color.setHex(color);
      slot.jointMat.color.setHex(color);
      this.writeSlot(slot, state.landmarks);
      this.updateLabel(slot, state, role, color);
    }

    for (const [id, slot] of this.slots) {
      if (seen.has(id)) continue;
      this.disposeSlot(slot);
      this.slots.delete(id);
    }
  }

  dispose(): void {
    for (const slot of this.slots.values()) this.disposeSlot(slot);
    this.slots.clear();
    this.dotTexture.dispose();
  }

  private createSlot(): Slot {
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(HAND_CONNECTIONS.length * 2 * 3), 3)
    );
    const boneMat = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const bones = new THREE.LineSegments(boneGeo, boneMat);
    bones.renderOrder = 2;
    bones.frustumCulled = false;

    const jointGeo = new THREE.BufferGeometry();
    jointGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(LANDMARK_COUNT * 3), 3)
    );
    const jointMat = new THREE.PointsMaterial({
      map: this.dotTexture,
      size: 16,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const joints = new THREE.Points(jointGeo, jointMat);
    joints.renderOrder = 3;
    joints.frustumCulled = false;

    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
    );
    label.scale.set(0.42, 0.105, 1);
    label.renderOrder = 4;

    const group = new THREE.Group();
    group.add(bones, joints, label);
    this.scene.add(group);
    return { group, bones, boneMat, joints, jointMat, label, labelCanvas, labelTexture, lastText: "" };
  }

  private writeSlot(slot: Slot, lms: Landmark[]): void {
    const bonePos = slot.bones.geometry.attributes.position as THREE.BufferAttribute;
    HAND_CONNECTIONS.forEach(([a, b], i) => {
      toScene(lms[a], this.tmp);
      bonePos.setXYZ(i * 2, this.tmp.x, this.tmp.y, this.tmp.z);
      toScene(lms[b], this.tmp);
      bonePos.setXYZ(i * 2 + 1, this.tmp.x, this.tmp.y, this.tmp.z);
    });
    bonePos.needsUpdate = true;

    const jointPos = slot.joints.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      toScene(lms[i], this.tmp);
      jointPos.setXYZ(i, this.tmp.x, this.tmp.y, this.tmp.z);
    }
    jointPos.needsUpdate = true;
  }

  private updateLabel(slot: Slot, state: HandState, role: HandRole | undefined, color: number): void {
    // Sit the label just below the wrist.
    toScene(state.landmarks[WRIST], this.tmp);
    slot.label.position.set(this.tmp.x, this.tmp.y - 0.1, Z);

    const name = role ? ROLE_LABEL[role] : "";
    const text = `${name}: ${state.pinch.toFixed(2)}`;
    if (text === slot.lastText) return;
    slot.lastText = text;

    const ctx = slot.labelCanvas.getContext("2d")!;
    const { width, height } = slot.labelCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(text, width / 2, height / 2);
    ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
    ctx.fillText(text, width / 2, height / 2);
    slot.labelTexture.needsUpdate = true;
  }

  private disposeSlot(slot: Slot): void {
    this.scene.remove(slot.group);
    slot.bones.geometry.dispose();
    slot.boneMat.dispose();
    slot.joints.geometry.dispose();
    slot.jointMat.dispose();
    (slot.label.material as THREE.SpriteMaterial).dispose();
    slot.labelTexture.dispose();
  }
}
