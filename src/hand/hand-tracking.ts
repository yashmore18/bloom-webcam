import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { HandState, InteractionSource, Landmark } from "../types";

// Keep this in sync with the @mediapipe/tasks-vision version in package.json —
// the JS (from npm) and the WASM (from CDN) must match. Verified to resolve.
const MP_VERSION = "0.10.35";
const WASM_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const SMOOTHING = 0.35; // lerp toward previous frame's landmarks (higher = snappier)
const MATCH_DISTANCE_THRESHOLD = 0.35; // normalized coords; beyond this = new hand
const LOST_TIMEOUT_MS = 500;

const WRIST = 0;
const PALM_CENTER = 9;
const THUMB_TIP = 4;
const INDEX_TIP = 8;

// Map the raw pinch ratio (finger gap / hand size) into a 0..1 openness.
// A smaller PINCH_MAX means less finger spread is needed to fully bloom.
const PINCH_MIN = 0.2; // fingers touching → seed
const PINCH_MAX = 0.9; // a moderate spread already reads as fully grown

interface TrackedHand {
  smoothed: Landmark[];
  lastSeen: number;
}

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export class HandTracking implements InteractionSource {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private nextId = 1;
  private tracked = new Map<number, TrackedHand>();

  async init(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      numHands: 2,
      runningMode: "VIDEO",
    });
  }

  getStates(timestamp: number): HandState[] {
    const video = this.video;
    if (!this.landmarker || !video || video.readyState < 2) return [];

    const result = this.landmarker.detectForVideo(video, timestamp);
    const detections: Landmark[][] = (result.landmarks ?? []).map((lms) =>
      lms.map((p) => ({ x: p.x, y: p.y, z: p.z }))
    );
    this.assignIds(detections, timestamp);

    const states: HandState[] = [];
    for (const [id, hand] of this.tracked) {
      if (hand.lastSeen !== timestamp) continue; // only hands seen this frame
      const lms = hand.smoothed;
      states.push({
        id,
        ...this.pinchMidpointScene(lms),
        pinch: this.computePinch(lms),
        landmarks: lms,
      });
    }
    return states;
  }

  private computePinch(lms: Landmark[]): number {
    const handSize = dist(lms[WRIST], lms[PALM_CENTER]) || 1e-6;
    const ratio = dist(lms[THUMB_TIP], lms[INDEX_TIP]) / handSize;
    return clamp01((ratio - PINCH_MIN) / (PINCH_MAX - PINCH_MIN));
  }

  /** Midpoint of thumb & index tips, mirrored X, mapped to scene [-1,1]. */
  private pinchMidpointScene(lms: Landmark[]): { x: number; y: number } {
    const mx = (lms[THUMB_TIP].x + lms[INDEX_TIP].x) / 2;
    const my = (lms[THUMB_TIP].y + lms[INDEX_TIP].y) / 2;
    return { x: (1 - mx) * 2 - 1, y: -(my * 2 - 1) };
  }

  /**
   * Greedy nearest-neighbor: match each detection to the closest previously
   * tracked hand (by palm position) within a threshold. Enough for 2 hands.
   */
  private assignIds(detections: Landmark[][], now: number): void {
    const trackedEntries = [...this.tracked.entries()];
    const usedTrackIds = new Set<number>();
    const usedDetections = new Set<number>();

    const pairs: { di: number; id: number; d: number }[] = [];
    detections.forEach((lms, di) => {
      for (const [id, hand] of trackedEntries) {
        pairs.push({ di, id, d: dist(lms[PALM_CENTER], hand.smoothed[PALM_CENTER]) });
      }
    });
    pairs.sort((a, b) => a.d - b.d);

    const detectionToId = new Map<number, number>();
    for (const { di, id, d } of pairs) {
      if (usedDetections.has(di) || usedTrackIds.has(id)) continue;
      if (d > MATCH_DISTANCE_THRESHOLD) continue;
      detectionToId.set(di, id);
      usedDetections.add(di);
      usedTrackIds.add(id);
    }

    detections.forEach((lms, di) => {
      const id = detectionToId.get(di) ?? this.nextId++;
      const existing = this.tracked.get(id);
      const smoothed = existing
        ? lms.map((p, i) => ({
            x: lerp(existing.smoothed[i].x, p.x, SMOOTHING),
            y: lerp(existing.smoothed[i].y, p.y, SMOOTHING),
            z: lerp(existing.smoothed[i].z, p.z, SMOOTHING),
          }))
        : lms;
      this.tracked.set(id, { smoothed, lastSeen: now });
    });

    for (const [id, hand] of this.tracked) {
      if (now - hand.lastSeen > LOST_TIMEOUT_MS) this.tracked.delete(id);
    }
  }
}
