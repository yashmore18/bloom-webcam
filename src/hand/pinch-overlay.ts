import * as THREE from "three";
import type { HandState, HandRole } from "../types";
import { assignRoles } from "./roles";

// Minimal, non-distracting hand overlay (replaces the full skeleton): per hand,
// a dot on the thumb tip and index tip, a line between them, and a live label
// ("Grow: 0.46" / "Bloom: 0.40"). Drawn in-scene so it's part of the recording.

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const Z = 0.05;

const ROLE_COLOR: Record<HandRole, number> = {
  grow: 0x39e08a, // green
  bloom: 0xffc23a, // gold
};
const ROLE_LABEL: Record<HandRole, string> = { grow: "Grow", bloom: "Bloom" };

function toScene(l: { x: number; y: number }, out: THREE.Vector3): THREE.Vector3 {
  return out.set((1 - l.x) * 2 - 1, -(l.y * 2 - 1), Z);
}

function makeDotTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.Texture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface Slot {
  group: THREE.Group;
  dots: THREE.Points;
  dotMat: THREE.PointsMaterial;
  line: THREE.LineSegments;
  lineMat: THREE.LineBasicMaterial;
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTexture: THREE.CanvasTexture;
  lastText: string;
}

export class PinchOverlay {
  private scene!: THREE.Scene;
  private dotTexture!: THREE.Texture;
  private slots = new Map<number, Slot>();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  init(scene: THREE.Scene): void {
    this.scene = scene;
    this.dotTexture = makeDotTexture();
  }

  update(states: HandState[]): void {
    const roles = assignRoles(states);
    const seen = new Set<number>();

    for (const state of states) {
      const role = roles.get(state.id);
      if (!role || state.landmarks.length < 21) continue;
      seen.add(state.id);

      let slot = this.slots.get(state.id);
      if (!slot) {
        slot = this.createSlot();
        this.slots.set(state.id, slot);
      }

      const color = ROLE_COLOR[role];
      slot.dotMat.color.setHex(color);
      slot.lineMat.color.setHex(color);

      toScene(state.landmarks[THUMB_TIP], this.a);
      toScene(state.landmarks[INDEX_TIP], this.b);

      const dp = slot.dots.geometry.attributes.position as THREE.BufferAttribute;
      dp.setXYZ(0, this.a.x, this.a.y, this.a.z);
      dp.setXYZ(1, this.b.x, this.b.y, this.b.z);
      dp.needsUpdate = true;

      const lp = slot.line.geometry.attributes.position as THREE.BufferAttribute;
      lp.setXYZ(0, this.a.x, this.a.y, this.a.z);
      lp.setXYZ(1, this.b.x, this.b.y, this.b.z);
      lp.needsUpdate = true;

      // Label at the midpoint, nudged above the pinch.
      slot.label.position.set(
        (this.a.x + this.b.x) / 2,
        (this.a.y + this.b.y) / 2 + 0.11,
        Z
      );
      const text = `${ROLE_LABEL[role]}: ${state.pinch.toFixed(2)}`;
      if (text !== slot.lastText) {
        this.drawLabel(slot, text, color);
        slot.lastText = text;
      }
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
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    const dotMat = new THREE.PointsMaterial({
      map: this.dotTexture,
      size: 15,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dots = new THREE.Points(dotGeo, dotMat);
    dots.renderOrder = 3;
    dots.frustumCulled = false;

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    const lineMat = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.LineSegments(lineGeo, lineMat);
    line.renderOrder = 2;
    line.frustumCulled = false;

    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const label = new THREE.Sprite(labelMat);
    label.scale.set(0.5, 0.125, 1);
    label.renderOrder = 4;

    const group = new THREE.Group();
    group.add(dots, line, label);
    this.scene.add(group);
    return {
      group,
      dots,
      dotMat,
      line,
      lineMat,
      label,
      labelCanvas,
      labelTexture,
      lastText: "",
    };
  }

  private drawLabel(slot: Slot, text: string, color: number): void {
    const ctx = slot.labelCanvas.getContext("2d")!;
    const { width, height } = slot.labelCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(text, width / 2, height / 2);
    ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
    ctx.fillText(text, width / 2, height / 2);
    slot.labelTexture.needsUpdate = true;
  }

  private disposeSlot(slot: Slot): void {
    this.scene.remove(slot.group);
    slot.dots.geometry.dispose();
    slot.dotMat.dispose();
    slot.line.geometry.dispose();
    slot.lineMat.dispose();
    (slot.label.material as THREE.SpriteMaterial).dispose();
    slot.labelTexture.dispose();
  }
}
