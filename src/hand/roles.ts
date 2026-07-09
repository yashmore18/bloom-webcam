import type { HandState, HandRole } from "../types";

// Fixed handedness → role mapping. Using the physical hand (not screen side)
// keeps each hand's role stable even when hands cross or come close. The
// mapping direction is arbitrary; the on-screen tint + label communicate it,
// and it's a one-line swap if the user wants it the other way.
const HANDEDNESS_ROLE = { Left: "grow", Right: "bloom" } as const;

/**
 * Assign each tracked hand a role. Preferred: by MediaPipe handedness (stable
 * per physical hand). Fallback (handedness missing, or both hands reported the
 * same label): by screen side — left-most = grow, right-most = bloom; a single
 * hand by its side.
 */
export function assignRoles(states: HandState[]): Map<number, HandRole> {
  const roles = new Map<number, HandRole>();
  if (states.length === 0) return roles;

  const labels = states.map((s) => s.handedness);
  const allLabelled = labels.every((l) => l !== undefined);
  const allDistinct = new Set(labels).size === labels.length;
  if (allLabelled && allDistinct) {
    for (const s of states) roles.set(s.id, HANDEDNESS_ROLE[s.handedness!]);
    return roles;
  }

  // Position fallback.
  if (states.length === 1) {
    roles.set(states[0].id, states[0].x < 0 ? "grow" : "bloom");
  } else {
    const sorted = [...states].sort((a, b) => a.x - b.x);
    roles.set(sorted[0].id, "grow"); // left-most
    roles.set(sorted[sorted.length - 1].id, "bloom"); // right-most
  }
  return roles;
}
