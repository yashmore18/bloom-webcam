import * as THREE from "three";
import type { HandState, Landmark } from "../types";

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
const Z = 0.02; // just in front of the video background plane

const BONE_COLOR = 0x37e8ff; // cyan
const JOINT_COLOR = 0xeafcff; // near-white

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
  joints: THREE.Points;
}

/**
 * Draws a glowing 21-landmark skeleton for each active hand. Per-hand buffers
 * are created once and their positions rewritten each frame (no per-frame
 * geometry allocation); slots for hands that disappear are disposed.
 */
export class HandSkeleton {
  private scene!: THREE.Scene;
  private dotTexture!: THREE.Texture;
  private boneMaterial!: THREE.LineBasicMaterial;
  private jointMaterial!: THREE.PointsMaterial;
  private slots = new Map<number, Slot>();
  private tmp = new THREE.Vector3();

  init(scene: THREE.Scene): void {
    this.scene = scene;
    this.dotTexture = makeDotTexture();
    this.boneMaterial = new THREE.LineBasicMaterial({
      color: BONE_COLOR,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.jointMaterial = new THREE.PointsMaterial({
      color: JOINT_COLOR,
      map: this.dotTexture,
      size: 16,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  update(states: HandState[]): void {
    const seen = new Set<number>();
    for (const state of states) {
      if (state.landmarks.length < LANDMARK_COUNT) continue;
      seen.add(state.id);
      let slot = this.slots.get(state.id);
      if (!slot) {
        slot = this.createSlot();
        this.slots.set(state.id, slot);
      }
      this.writeSlot(slot, state.landmarks);
    }
    for (const [id, slot] of this.slots) {
      if (seen.has(id)) continue;
      this.scene.remove(slot.group);
      slot.bones.geometry.dispose();
      slot.joints.geometry.dispose();
      this.slots.delete(id);
    }
  }

  dispose(): void {
    for (const slot of this.slots.values()) {
      this.scene.remove(slot.group);
      slot.bones.geometry.dispose();
      slot.joints.geometry.dispose();
    }
    this.slots.clear();
    this.boneMaterial.dispose();
    this.jointMaterial.dispose();
    this.dotTexture.dispose();
  }

  private createSlot(): Slot {
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(HAND_CONNECTIONS.length * 2 * 3), 3)
    );
    const bones = new THREE.LineSegments(boneGeo, this.boneMaterial);
    bones.renderOrder = 2;
    bones.frustumCulled = false;

    const jointGeo = new THREE.BufferGeometry();
    jointGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(LANDMARK_COUNT * 3), 3)
    );
    const joints = new THREE.Points(jointGeo, this.jointMaterial);
    joints.renderOrder = 3;
    joints.frustumCulled = false;

    const group = new THREE.Group();
    group.add(bones, joints);
    this.scene.add(group);
    return { group, bones, joints };
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
}
