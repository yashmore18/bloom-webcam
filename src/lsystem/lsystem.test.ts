import { describe, it, expect } from "vitest";
import { generatePlant } from "./lsystem";

describe("generatePlant", () => {
  it("produces segments and flowers", () => {
    const plant = generatePlant({ iterations: 4 });
    expect(plant.segments.length).toBeGreaterThan(50);
    expect(plant.flowers.length).toBeGreaterThan(0);
  });

  it("normalizes births into [0,1] with a root segment at birth 0", () => {
    const plant = generatePlant({ iterations: 4 });
    for (const s of plant.segments) {
      expect(s.birth).toBeGreaterThanOrEqual(0);
      expect(s.birth).toBeLessThanOrEqual(1);
    }
    const minBirth = Math.min(...plant.segments.map((s) => s.birth));
    const maxBirth = Math.max(...plant.segments.map((s) => s.birth));
    expect(minBirth).toBe(0); // root appears first
    expect(maxBirth).toBeGreaterThan(0.8); // tips appear last
  });

  it("scales to the requested height with the root near the origin", () => {
    const plant = generatePlant({ iterations: 4, targetHeight: 2 });
    const ys = plant.segments.flatMap((s) => [s.y1, s.y2]);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(height).toBeCloseTo(2, 1);
    // First segment starts at the origin.
    expect(plant.segments[0].x1).toBeCloseTo(0, 5);
    expect(plant.segments[0].y1).toBeCloseTo(0, 5);
  });

  it("caps flower count", () => {
    const plant = generatePlant({ iterations: 5, maxFlowers: 30 });
    expect(plant.flowers.length).toBeLessThanOrEqual(30);
  });

  it("is deterministic for a given seed and varies across seeds", () => {
    const a = generatePlant({ iterations: 4, seed: 7 });
    const b = generatePlant({ iterations: 4, seed: 7 });
    const c = generatePlant({ iterations: 4, seed: 8 });
    expect(a.segments[10]).toEqual(b.segments[10]);
    // Different seed → different jittered geometry somewhere.
    const differs = a.segments.some(
      (s, i) => c.segments[i] && (s.x2 !== c.segments[i].x2 || s.y2 !== c.segments[i].y2)
    );
    expect(differs).toBe(true);
  });

  it("[measurement] segment/flower counts by depth", () => {
    for (const iterations of [2, 3, 4]) {
      const p = generatePlant({ iterations });
      // eslint-disable-next-line no-console
      console.log(`depth ${iterations}: ${p.segments.length} segments, ${p.flowers.length} flowers`);
    }
    expect(true).toBe(true);
  });
});
