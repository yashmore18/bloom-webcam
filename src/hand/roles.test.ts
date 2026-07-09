import { describe, it, expect } from "vitest";
import { assignRoles } from "./roles";
import type { HandState, Handedness } from "../types";

function hand(id: number, x: number, handedness?: Handedness): HandState {
  return { id, x, y: 0, pinch: 0.5, landmarks: [], handedness };
}

describe("assignRoles", () => {
  it("has no roles with zero hands", () => {
    expect(assignRoles([]).size).toBe(0);
  });

  describe("handedness-based (preferred)", () => {
    it("maps Left→grow and Right→bloom regardless of screen side", () => {
      // Right hand on the left of screen, Left hand on the right (crossed) —
      // roles still follow the physical hand.
      const roles = assignRoles([hand(1, -0.5, "Right"), hand(2, 0.5, "Left")]);
      expect(roles.get(1)).toBe("bloom"); // Right
      expect(roles.get(2)).toBe("grow"); // Left
    });

    it("a single labelled hand uses its handedness", () => {
      expect(assignRoles([hand(1, 0.4, "Left")]).get(1)).toBe("grow");
      expect(assignRoles([hand(2, -0.4, "Right")]).get(2)).toBe("bloom");
    });
  });

  describe("position fallback", () => {
    it("falls back to side when handedness is missing", () => {
      const roles = assignRoles([hand(1, 0.5), hand(2, -0.5)]);
      expect(roles.get(2)).toBe("grow"); // left-most
      expect(roles.get(1)).toBe("bloom"); // right-most
    });

    it("falls back to side when both hands report the same label", () => {
      const roles = assignRoles([hand(1, 0.5, "Left"), hand(2, -0.5, "Left")]);
      expect(roles.get(2)).toBe("grow"); // left-most
      expect(roles.get(1)).toBe("bloom"); // right-most
    });

    it("single unlabelled hand by side", () => {
      expect(assignRoles([hand(1, -0.4)]).get(1)).toBe("grow");
      expect(assignRoles([hand(2, 0.4)]).get(2)).toBe("bloom");
    });
  });
});
