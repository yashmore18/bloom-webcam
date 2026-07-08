import * as THREE from "three";
import type { Plant } from "../lsystem/lsystem";

// Renders one L-system plant as a single LineSegments mesh whose growth is
// driven by a uGrowth uniform (segments with birth > growth are discarded),
// plus small flower heads at the tips that scale in as growth passes them.

const STEM_COLOR = new THREE.Color(0x2fd35a); // lime stem
const TIP_COLOR = new THREE.Color(0xdcffb0); // bright growing frontier
// Lily colors — each plant picks one so a hand's lilies are a consistent shade.
// Saturated (not near-white) so the bloom pass glows them in-color instead of
// blowing them out to featureless white blobs.
const LILY_PALETTE = [0xff5d8f, 0xe0409a, 0xc65cf0, 0xff5470, 0xd94fb0];
const LILY_STAMEN = 0xffe08a; // pale golden anthers (contrast on the petals)
const LILY_CENTER = 0xfff3b0; // warm pale throat
const SUNFLOWER_PETAL = 0xffc23a; // golden petals
const SUNFLOWER_CENTER = 0x3d2914; // dark brown seed disc

const BLOOM_WINDOW = 0.08; // how much growth-past-birth a flower takes to open

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

const polar = (r: number, a: number): number[] => [Math.cos(a) * r, Math.sin(a) * r, 0];

/**
 * Shared, immutable lily: 6 slender pointed petals (unit outer radius) with
 * clear gaps between them, giving the characteristic 6-tepal lily star.
 */
function makeLilyPetalsGeometry(petals = 6): THREE.BufferGeometry {
  const rBase = 0.06;
  const rMid = 0.4;
  const rTip = 1.0;
  const positions: number[] = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const hw = (Math.PI / petals) * 0.72; // broad enough to read as petals, with gaps
    const p0 = polar(rBase, a);
    const p1 = polar(rMid, a - hw);
    const p2 = polar(rTip, a); // pointed tip
    const p3 = polar(rMid, a + hw);
    positions.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/**
 * Shared, immutable lily stamens: thin spokes tipped with a small anther,
 * set in the gaps between the petals — the signature lily detail.
 */
function makeStamenGeometry(count = 6): THREE.BufferGeometry {
  const positions: number[] = [];
  const w = 0.03; // spoke half-width (radians)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count; // offset into petal gaps
    // filament (thin quad from throat outward)
    const b0 = polar(0.05, a - w);
    const b1 = polar(0.05, a + w);
    const t0 = polar(0.55, a - w * 0.5);
    const t1 = polar(0.55, a + w * 0.5);
    positions.push(...b0, ...b1, ...t1, ...b0, ...t1, ...t0);
    // anther (small diamond at the tip)
    const c = 0.6;
    const a0 = polar(c - 0.06, a);
    const a1 = polar(c, a - 0.05);
    const a2 = polar(c + 0.06, a);
    const a3 = polar(c, a + 0.05);
    positions.push(...a0, ...a1, ...a2, ...a0, ...a2, ...a3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/**
 * Shared, immutable sunflower: a dense radial fan of pointed ray florets
 * (unit outer radius) around a wide center disc.
 */
function makeSunflowerGeometry(petals = 18): THREE.BufferGeometry {
  const rBase = 0.14;
  const rMid = 0.58;
  const rTip = 1.0;
  const positions: number[] = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const hw = (Math.PI / petals) * 1.15; // slight overlap for a full head
    const p0 = polar(rBase, a);
    const p1 = polar(rMid, a - hw);
    const p2 = polar(rTip, a);
    const p3 = polar(rMid, a + hw);
    positions.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

const lilyPetalsGeometry = makeLilyPetalsGeometry();
const stamenGeometry = makeStamenGeometry();
const sunflowerGeometry = makeSunflowerGeometry();
const centerGeometry = new THREE.CircleGeometry(1, 20); // unit disc (throat/seed disc), scaled per flower

export interface PlantVisual {
  group: THREE.Group;
  setGrowth(growth: number): void;
  setPosition(x: number, y: number): void;
  setSway(radians: number): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

// A flower is a set of meshes, each scaled by (flowerRadius * scale) as it
// blooms. This lets sunflowers and lilies (different part counts/sizes) share
// one bloom/fade code path.
interface FlowerNode {
  parts: { mesh: THREE.Mesh; scale: number }[];
  birth: number;
}

/**
 * Build a renderable plant from generated geometry. Tips alternate between
 * sunflowers and lilies for a mixed bouquet; `hue` selects the lily shade so
 * each hand's plant differs.
 */
export function createPlantVisual(plant: Plant, hue = 0): PlantVisual {
  const group = new THREE.Group();

  // ── stems (one LineSegments, growth via shader) ──
  const segCount = plant.segments.length;
  const positions = new Float32Array(segCount * 2 * 3);
  const births = new Float32Array(segCount * 2);
  plant.segments.forEach((s, i) => {
    positions.set([s.x1, s.y1, 0, s.x2, s.y2, 0], i * 6);
    births[i * 2] = s.birth;
    births[i * 2 + 1] = s.birth;
  });
  const stemGeo = new THREE.BufferGeometry();
  stemGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  stemGeo.setAttribute("birth", new THREE.BufferAttribute(births, 1));

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
  });
  const stems = new THREE.LineSegments(stemGeo, stemMaterial);
  stems.renderOrder = 1;
  stems.frustumCulled = false;
  group.add(stems);

  // ── mixed sunflowers + lilies at tips ──
  // Per-plant materials so each plant fades independently. `hue` picks the lily
  // shade; sunflowers are always gold so the mix stays readable.
  const lilyColor = LILY_PALETTE[Math.floor(hue * LILY_PALETTE.length) % LILY_PALETTE.length];
  const basic = (color: number) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const lilyPetalMat = basic(lilyColor);
  const lilyStamenMat = basic(LILY_STAMEN);
  const lilyThroatMat = basic(LILY_CENTER);
  const sunPetalMat = basic(SUNFLOWER_PETAL);
  const sunCenterMat = basic(SUNFLOWER_CENTER);
  const allMaterials = [lilyPetalMat, lilyStamenMat, lilyThroatMat, sunPetalMat, sunCenterMat];

  const flowerRadius = plant.height * 0.06;
  let zBias = 0;
  const makeMesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    f: { x: number; y: number; angle: number },
    order: number,
    rotate: boolean
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(f.x, f.y, 0.01 + zBias);
    zBias += 0.001;
    if (rotate) mesh.rotation.z = f.angle;
    mesh.scale.setScalar(0);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  const flowerNodes: FlowerNode[] = plant.flowers.map((f, i) => {
    const parts: { mesh: THREE.Mesh; scale: number }[] = [];
    if (i % 2 === 0) {
      // sunflower: petal ring + wide brown disc
      parts.push({ mesh: makeMesh(sunflowerGeometry, sunPetalMat, f, 4, true), scale: 1 });
      parts.push({ mesh: makeMesh(centerGeometry, sunCenterMat, f, 5, false), scale: 0.42 });
    } else {
      // lily: 6 tepals + pale throat + golden stamens
      parts.push({ mesh: makeMesh(lilyPetalsGeometry, lilyPetalMat, f, 4, true), scale: 1 });
      parts.push({ mesh: makeMesh(centerGeometry, lilyThroatMat, f, 5, false), scale: 0.18 });
      parts.push({ mesh: makeMesh(stamenGeometry, lilyStamenMat, f, 6, true), scale: 1 });
    }
    return { parts, birth: f.birth };
  });

  function setGrowth(growth: number): void {
    stemMaterial.uniforms.uGrowth.value = growth;
    for (const node of flowerNodes) {
      // 0 until growth reaches the flower's birth, easing to full over BLOOM_WINDOW.
      const t = THREE.MathUtils.clamp((growth - node.birth) / BLOOM_WINDOW, 0, 1);
      const s = t * t * (3 - 2 * t); // smoothstep
      for (const part of node.parts) part.mesh.scale.setScalar(s * flowerRadius * part.scale);
    }
  }
  setGrowth(0);

  function setPosition(x: number, y: number): void {
    group.position.set(x, y, 0);
  }

  function setSway(radians: number): void {
    group.rotation.z = radians;
  }

  function setOpacity(opacity: number): void {
    stemMaterial.uniforms.uOpacity.value = opacity;
    for (const m of allMaterials) m.opacity = opacity;
  }

  function dispose(): void {
    stemGeo.dispose();
    stemMaterial.dispose();
    for (const m of allMaterials) m.dispose();
    // shared flower geometries are reused across instances — not disposed.
  }

  return { group, setGrowth, setPosition, setSway, setOpacity, dispose };
}
