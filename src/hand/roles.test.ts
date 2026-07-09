import { describe, it, expect } from "vitest";
import { assignRoles } from "./roles";
import type { HandState } from "../types";

function hand(id: number, x: number): HandState {
  return { id, x, y: 0, pinch: 0.5, landmarks: [] };
}

describe("assignRoles", () => {
  it("has no roles with zero hands", () => {
    expect(assignRoles([]).size).toBe(0);
  });

  it("a single left-side hand is grow, right-side is bloom", () => {
    expect(assignRoles([hand(1, -0.4)]).get(1)).toBe("grow");
    expect(assignRoles([hand(2, 0.4)]).get(2)).toBe("bloom");
  });

  it("with two hands, left-most is grow and right-most is bloom", () => {
    const roles = assignRoles([hand(1, 0.5), hand(2, -0.5)]);
    expect(roles.get(2)).toBe("grow"); // left-most
    expect(roles.get(1)).toBe("bloom"); // right-most
  });

  it("assignment follows position, not id order (survives crossing)", () => {
    // hand 1 crosses to the left of hand 2
    const roles = assignRoles([hand(1, -0.6), hand(2, 0.2)]);
    expect(roles.get(1)).toBe("grow");
    expect(roles.get(2)).toBe("bloom");
  });
});
