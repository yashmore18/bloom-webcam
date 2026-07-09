import type { HandState, HandRole } from "../types";

/**
 * Assign each tracked hand a role by screen side: the left-most hand controls
 * Grow, the right-most controls Bloom. With a single hand, its side decides
 * (left half → grow, right half → bloom), so one hand can drive either
 * parameter and the other simply holds its last value.
 */
export function assignRoles(states: HandState[]): Map<number, HandRole> {
  const roles = new Map<number, HandRole>();
  if (states.length === 1) {
    roles.set(states[0].id, states[0].x < 0 ? "grow" : "bloom");
  } else if (states.length >= 2) {
    const sorted = [...states].sort((a, b) => a.x - b.x);
    roles.set(sorted[0].id, "grow"); // left-most
    roles.set(sorted[sorted.length - 1].id, "bloom"); // right-most
  }
  return roles;
}
