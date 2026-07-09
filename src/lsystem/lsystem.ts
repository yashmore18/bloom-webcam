// Pure L-system plant generator — no three.js, unit-testable in isolation.
//
// An axiom + production rules are expanded to a fixed depth, then interpreted
// with a 2D turtle into line segments + flower positions. Each element carries
// a normalized `birth` ∈ [0,1] (its path-distance from the root), so a renderer
// can "grow" the plant by revealing everything with birth <= growth.

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Normalized path-distance from the root [0,1] — when this segment appears. */
  birth: number;
}

export interface Flower {
  x: number;
  y: number;
  birth: number;
  /** Turtle heading (radians) at this tip, for orienting the bloom. */
  angle: number;
}

export interface Plant {
  segments: Segment[];
  flowers: Flower[];
  /** World-space height the plant was normalized to. */
  height: number;
}

export interface PlantOptions {
  iterations?: number;
  angleDeg?: number;
  /** Seed for deterministic per-plant jitter so each hand's plant differs. */
  seed?: number;
  /** Random angle jitter (radians) applied per turn. */
  jitter?: number;
  /** Per-sub-step heading drift (radians) that gives stems a natural curve. */
  curl?: number;
  /** Target world height to scale the plant to (root at origin, growing +y). */
  targetHeight?: number;
  /** Max number of flowers kept (outermost tips), after spatial dedupe. */
  maxFlowers?: number;
}

// Monopodial bouquet: each X puts out two symmetric side branches AND a central
// leader that keeps climbing ([+X][-X] then F X). Rooted heading straight up
// with a wide branch angle, the side branches fan outward-and-up from a single
// base into a vertical V / funnel (vase); the central leader + symmetry keep it
// upright with no sideways lean. Terminal X's are the tips (one flower each).
const RULES: Record<string, string> = {
  X: "F[+X][-X]FX",
  F: "FF",
};
const AXIOM = "X";

/** Deterministic PRNG (mulberry32) so a seed reproduces the same plant. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expand(iterations: number): string {
  let s = AXIOM;
  for (let i = 0; i < iterations; i++) {
    let next = "";
    for (const ch of s) next += RULES[ch] ?? ch;
    s = next;
  }
  return s;
}

interface Turtle {
  x: number;
  y: number;
  angle: number;
  dist: number;
  /** Smoothly-varying angular velocity that bends the stem into gentle curves. */
  curlVel: number;
}

/**
 * Generate a plant. Deterministic for a given `seed`. Coordinates are scaled so
 * the plant is `targetHeight` tall with its root at the origin, growing upward.
 */
export function generatePlant(options: PlantOptions = {}): Plant {
  const {
    iterations = 4,
    angleDeg = 28,
    seed = 1,
    jitter = 0.12,
    targetHeight = 1,
    maxFlowers = 36,
  } = options;

  const rand = mulberry32(seed);
  const baseAngle = (angleDeg * Math.PI) / 180;
  const stepLen = 1;
  // Draw each step as several short sub-segments whose heading follows a damped,
  // integrated drift, so stems curve organically instead of reading as rigid
  // lines. A moderate up-righting bias keeps them trending upward (no off-axis
  // wander) while the branch angle still fans the bouquet.
  const SUBSTEPS = 4;
  const curlAccel = options.curl ?? 0.045;
  const CURL_DAMP = 0.86;
  const UP_BIAS = 0.05;

  const symbols = expand(iterations);
  const segments: Segment[] = [];
  const rawFlowers: Flower[] = [];

  let state: Turtle = { x: 0, y: 0, angle: Math.PI / 2, dist: 0, curlVel: 0 }; // heading up
  const stack: Turtle[] = [];
  let maxDist = 0;

  for (const ch of symbols) {
    switch (ch) {
      case "F": {
        const sub = stepLen / SUBSTEPS;
        for (let k = 0; k < SUBSTEPS; k++) {
          state.curlVel = state.curlVel * CURL_DAMP + (rand() - 0.5) * 2 * curlAccel;
          state.angle += state.curlVel;
          state.angle += (Math.PI / 2 - state.angle) * UP_BIAS; // keep trending up
          const nx = state.x + Math.cos(state.angle) * sub;
          const ny = state.y + Math.sin(state.angle) * sub;
          segments.push({ x1: state.x, y1: state.y, x2: nx, y2: ny, birth: state.dist });
          state.x = nx;
          state.y = ny;
          state.dist += sub;
          if (state.dist > maxDist) maxDist = state.dist;
        }
        break;
      }
      case "+":
        state.angle += baseAngle + (rand() - 0.5) * 2 * jitter;
        break;
      case "-":
        state.angle -= baseAngle + (rand() - 0.5) * 2 * jitter;
        break;
      case "[":
        stack.push({ ...state });
        break;
      case "]": {
        const popped = stack.pop();
        if (popped) state = popped;
        break;
      }
      case "X":
        rawFlowers.push({ x: state.x, y: state.y, birth: state.dist, angle: state.angle });
        break;
    }
  }

  // Normalize births into [0, BIRTH_MAX] (not [0,1]): `grow` only approaches
  // the pinch target (max 1) asymptotically, and a tip needs grow > birth to
  // reveal + flower, so births must top out below 1 or the outermost branch
  // ends would never fully grow/bloom (leaving bare branches).
  const BIRTH_MAX = 0.82;
  const norm = maxDist || 1;
  for (const s of segments) s.birth = Math.min(1, s.birth / norm) * BIRTH_MAX;
  for (const f of rawFlowers) f.birth = Math.min(1, f.birth / norm) * BIRTH_MAX;

  // Scale so the plant is targetHeight tall, root at origin.
  let minY = 0;
  let maxY = 0;
  for (const s of segments) {
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const span = maxY - minY || 1;
  const scale = targetHeight / span;
  for (const s of segments) {
    s.x1 *= scale;
    s.y1 *= scale;
    s.x2 *= scale;
    s.y2 *= scale;
  }
  for (const f of rawFlowers) {
    f.x *= scale;
    f.y *= scale;
  }

  const flowers = dedupeFlowers(rawFlowers, targetHeight * 0.07, maxFlowers);
  return { segments, flowers, height: targetHeight };
}

/**
 * Collapse flowers that fall in the same spatial cell (many X symbols land at
 * the same tip), then keep the `max` outermost ones (highest birth).
 */
function dedupeFlowers(flowers: Flower[], cell: number, max: number): Flower[] {
  const byCell = new Map<string, Flower>();
  for (const f of flowers) {
    const key = `${Math.round(f.x / cell)},${Math.round(f.y / cell)}`;
    const existing = byCell.get(key);
    if (!existing || f.birth > existing.birth) byCell.set(key, f);
  }
  return [...byCell.values()].sort((a, b) => b.birth - a.birth).slice(0, max);
}
