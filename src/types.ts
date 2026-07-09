import type * as THREE from "three";

/** A single hand landmark in MediaPipe's normalized [0,1] image coordinates. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * The per-frame state of one tracked hand, consumed by templates and the
 * skeleton overlay. Kept as a plain data bag so the InteractionSource
 * interface itself stays tiny (2 methods) — richer data rides in here rather
 * than in extra interface methods.
 */
export interface HandState {
  /** Stable id, consistent across frames (nearest-neighbor assignment). */
  id: number;
  /** Pinch-midpoint position in scene coords, normalized to [-1, 1], mirrored. */
  x: number;
  y: number;
  /** Pinch openness: 0 = thumb & index touching (seed), 1 = spread wide (grown). */
  pinch: number;
  /** The 21 smoothed landmarks (normalized image coords) for the skeleton overlay. */
  landmarks: Landmark[];
}

/**
 * Any input method (hand-tracking today, pose/face later) implements this.
 * Intentionally 2 methods — see HandState for where the real data lives.
 */
export interface InteractionSource {
  /** Set up the model, called once. */
  init(video: HTMLVideoElement): Promise<void>;
  /** Returns the currently active hand states for this frame. */
  getStates(timestamp: number): HandState[];
}

/** Which parameter a hand drives in the two-hand grow/bloom interaction. */
export type HandRole = "grow" | "bloom";

/**
 * Any visual effect (L-system plant today, other generative templates later)
 * implements this. 3 methods — add a new template by writing one file that
 * implements TemplateModule, without touching main.ts's loop.
 */
export interface TemplateModule {
  /** Add persistent objects to the shared scene, called once. */
  init(scene: THREE.Scene): void;
  /** Called every frame with the active hand states and delta-time (seconds). */
  update(states: HandState[], dt: number): void;
  /** Remove this template's objects from the scene (template switch). */
  dispose(): void;
}
