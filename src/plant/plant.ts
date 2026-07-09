import * as THREE from "three";
import type { Plant } from "../lsystem/lsystem";

// Renders one L-system plant as a single LineSegments mesh whose growth is
// driven by a uGrowth uniform (segments with birth > growth are discarded),
// plus small flower heads at the tips that scale in as growth passes them.

const STEM_COLOR = new THREE.Color(0x2fd35a); // lime stem
const TIP_COLOR = new THREE.Color(0xdcffb0); // bright growing frontier
const FLOWER_PALETTE = [0xff5d8f, 0xffd23f, 0xff8c42, 0xc77dff, 0xff6f61];

const BLOOM_WINDOW = 0.08; // how much grow-past-birth a flower takes to appear
const BUD_FRACTION = 0.22; // size of a born-but-unbloomed flower (a small bud)

const vertexShader = /* glsl */ `
  attribute float birth;
  varying float vBirth;
  void main() {
    vBirth = birth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform float uGrowth;
  uniform vec3 uStem;
  uniform vec3 uTip;
  uniform float uOpacity;
  varying float vBirth;
  void main() {
    if (vBirth > uGrowth) discard;
    // Brighten toward the growing frontier for a glowing "growth tip".
    float behind = smoothstep(0.0, 0.14, uGrowth - vBirth);
    vec3 col = mix(uTip, uStem, behind);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

/** Shared, immutable rosette outline for tiny tip flowers (6 lobes). */
function makeRosetteGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = 0.62 + 0.38 * Math.cos(6 * t);
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape, 16);
}

const rosetteGeometry = makeRosetteGeometry();
const centerGeometry = new THREE.CircleGeometry(0.4, 16);

export interface PlantVisual {
  group: THREE.Group;
  /** 0..1 — reveals the stems and makes flowers appear as buds along the tips. */
  setGrow(grow: number): void;
  /** 0..1 — opens the (already-grown) buds from small bud to full flower. */
  setBloom(bloom: number): void;
  setPosition(x: number, y: number): void;
  setSway(radians: number): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

interface FlowerNode {
  mesh: THREE.Mesh; // rosette
  center: THREE.Mesh;
  birth: number;
}

/**
 * Build a renderable plant from generated geometry. `hue` shifts the flower
 * palette selection so each hand's plant looks a little different.
 */
export function createPlantVisual(plant: Plant, hue = 0): PlantVisual {
  const group = new THREE.Group();

  // ── stems (one quad-ribbon mesh with real width, growth via shader) ──
  // Each segment becomes a thin rectangle (2 tris) offset perpendicular to its
  // direction, so stems have visible thickness (a plain LineSegments is stuck
  // at 1px). Birth per vertex keeps the uGrowth reveal working unchanged.
  const HALF_WIDTH = plant.height * 0.005;
  const segCount = plant.segments.length;
  const positions = new Float32Array(segCount * 4 * 3);
  const births = new Float32Array(segCount * 4);
  const indices = new Uint32Array(segCount * 6);
  plant.segments.forEach((s, i) => {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1e-6;
    const nx = (-dy / len) * HALF_WIDTH;
    const ny = (dx / len) * HALF_WIDTH;
    positions.set(
      [
        s.x1 + nx, s.y1 + ny, 0,
        s.x1 - nx, s.y1 - ny, 0,
        s.x2 + nx, s.y2 + ny, 0,
        s.x2 - nx, s.y2 - ny, 0,
      ],
      i * 12
    );
    births.fill(s.birth, i * 4, i * 4 + 4);
    const v = i * 4;
    indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
  });
  const stemGeo = new THREE.BufferGeometry();
  stemGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  stemGeo.setAttribute("birth", new THREE.BufferAttribute(births, 1));
  stemGeo.setIndex(new THREE.BufferAttribute(indices, 1));

  const stemMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uGrowth: { value: 0 },
      uStem: { value: STEM_COLOR.clone() },
      uTip: { value: TIP_COLOR.clone() },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const stems = new THREE.Mesh(stemGeo, stemMaterial);
  stems.renderOrder = 1;
  stems.frustumCulled = false;
  group.add(stems);

  // ── flowers at tips ──
  // Per-plant materials so each plant fades independently.
  const petalMaterials = FLOWER_PALETTE.map(
    (c) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(c).offsetHSL(hue, 0, 0),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
  );
  const centerMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const flowerRadius = plant.height * 0.062; // factor bumped so blooms keep size as the stem shortens
  const flowerNodes: FlowerNode[] = plant.flowers.map((f, i) => {
    const mesh = new THREE.Mesh(rosetteGeometry, petalMaterials[i % petalMaterials.length]);
    mesh.position.set(f.x, f.y, 0.01);
    mesh.rotation.z = f.angle;
    mesh.scale.setScalar(0);
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;

    const center = new THREE.Mesh(centerGeometry, centerMaterial);
    center.position.set(f.x, f.y, 0.02);
    center.scale.setScalar(0);
    center.renderOrder = 5;
    center.frustumCulled = false;

    group.add(mesh, center);
    return { mesh, center, birth: f.birth };
  });

  // grow gates whether a flower has appeared (as a bud); bloom opens it.
  let grow = 0;
  let bloom = 0;

  function applyFlowers(): void {
    for (const node of flowerNodes) {
      // born-ness: 0 until grow reaches the flower's birth, easing in over BLOOM_WINDOW.
      const t = THREE.MathUtils.clamp((grow - node.birth) / BLOOM_WINDOW, 0, 1);
      const born = t * t * (3 - 2 * t); // smoothstep
      // openness: born bud (BUD_FRACTION) → full flower (1) as bloom rises.
      const open = THREE.MathUtils.lerp(BUD_FRACTION, 1, bloom);
      const s = born * open * flowerRadius;
      node.mesh.scale.setScalar(s);
      node.center.scale.setScalar(s * 0.45);
    }
  }

  function setGrow(value: number): void {
    grow = value;
    stemMaterial.uniforms.uGrowth.value = grow;
    applyFlowers();
  }

  function setBloom(value: number): void {
    bloom = value;
    applyFlowers();
  }
  setGrow(0);
  setBloom(0);

  function setPosition(x: number, y: number): void {
    group.position.set(x, y, 0);
  }

  function setSway(radians: number): void {
    group.rotation.z = radians;
  }

  function setOpacity(opacity: number): void {
    stemMaterial.uniforms.uOpacity.value = opacity;
    for (const m of petalMaterials) m.opacity = opacity;
    centerMaterial.opacity = opacity;
  }

  function dispose(): void {
    stemGeo.dispose();
    stemMaterial.dispose();
    for (const m of petalMaterials) m.dispose();
    centerMaterial.dispose();
    // rosetteGeometry/centerGeometry are shared across instances — not disposed.
  }

  return { group, setGrow, setBloom, setPosition, setSway, setOpacity, dispose };
}
