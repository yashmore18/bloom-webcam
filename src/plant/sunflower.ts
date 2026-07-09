import * as THREE from "three";

// The original Bloom flower, rebuilt: a parametric radial sunflower head
// (15 pointed petals + brown seed-disc + gold rim) on a single curved stem.
// Two independent controls:
//   setGrow(g)  — the plant growing: the stem draws up and the head rides its
//                 tip, scaling in from a small bud to the full head.
//   setBloom(b) — the petals opening (the original "openness"): folded bud → open.

const PETAL_COUNT = 15;
const PETAL_COLOR = 0xffc72c;
const CENTER_COLOR = 0x5c3d1e;
const RIM_COLOR = 0xe8b923;
const STEM_COLOR = new THREE.Color(0x3aa35a);

const STEM_BASE = new THREE.Vector3(0, -1.15, 0);
const STEM_CONTROL = new THREE.Vector3(0.14, -0.5, 0.02);
const STEM_TOP = new THREE.Vector3(0, 0.18, 0);

// ── shared petal geometry (pointed oval, cupped forward, pivot at base) ──
function makePetalGeometry(): THREE.ShapeGeometry {
  const length = 0.55;
  const width = 0.11;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width * 0.55, length * 0.12, width * 0.5, length * 0.4);
  shape.quadraticCurveTo(width * 0.4, length * 0.75, 0, length);
  shape.quadraticCurveTo(-width * 0.4, length * 0.75, -width * 0.5, length * 0.4);
  shape.quadraticCurveTo(-width * 0.55, length * 0.12, 0, 0);

  const geometry = new THREE.ShapeGeometry(shape, 12);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const t = y / length;
    const crease = Math.cos((x / width) * Math.PI * 0.5) * 0.015;
    pos.setZ(i, Math.sin(t * Math.PI * 0.6) * 0.09 + crease);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const petalGeometry = makePetalGeometry();
const rimGeometry = new THREE.CircleGeometry(0.19, 24);
const centerGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24);

// ── stem growth shader (reveal up to uGrow by per-vertex birth) ──
const stemVertex = /* glsl */ `
  attribute float birth;
  varying float vBirth;
  void main() {
    vBirth = birth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const stemFragment = /* glsl */ `
  precision mediump float;
  uniform float uGrow;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vBirth;
  void main() {
    if (vBirth > uGrow) discard;
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

function makeStem(): {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  curve: THREE.QuadraticBezierCurve3;
} {
  const curve = new THREE.QuadraticBezierCurve3(STEM_BASE, STEM_CONTROL, STEM_TOP);
  const T = 48;
  const R = 6;
  const geometry = new THREE.TubeGeometry(curve, T, 0.018, R, false);

  // Birth per vertex = ring index / T (0 at base → 1 at tip), matching
  // TubeGeometry's row-major vertex order ((T+1) rings × (R+1)).
  const births = new Float32Array((T + 1) * (R + 1));
  let v = 0;
  for (let i = 0; i <= T; i++) {
    for (let j = 0; j <= R; j++) births[v++] = i / T;
  }
  geometry.setAttribute("birth", new THREE.BufferAttribute(births, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: stemVertex,
    fragmentShader: stemFragment,
    uniforms: {
      uGrow: { value: 0 },
      uColor: { value: STEM_COLOR.clone() },
      uOpacity: { value: 1 },
    },
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, material, curve };
}

export interface Sunflower {
  group: THREE.Group;
  setGrow(grow: number): void;
  setBloom(bloom: number): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

export function createSunflower(): Sunflower {
  const group = new THREE.Group();

  const stem = makeStem();
  group.add(stem.mesh);

  // Head lives in its own subgroup so it can ride the growing stem tip and
  // scale in, independent of petal bloom.
  const head = new THREE.Group();
  group.add(head);

  const petalMaterial = new THREE.MeshStandardMaterial({
    color: PETAL_COLOR,
    emissive: PETAL_COLOR,
    emissiveIntensity: 0.35,
    roughness: 0.55,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const centerMaterial = new THREE.MeshStandardMaterial({
    color: CENTER_COLOR,
    roughness: 0.9,
    transparent: true,
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: RIM_COLOR,
    roughness: 0.8,
    transparent: true,
  });

  const petals: THREE.Mesh[] = [];
  for (let i = 0; i < PETAL_COUNT; i++) {
    const petal = new THREE.Mesh(petalGeometry, petalMaterial);
    petal.userData.targetAngle = (i / PETAL_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.06;
    petal.rotation.x = -0.12; // constant forward cup
    petal.position.z = -0.01;
    head.add(petal);
    petals.push(petal);
  }

  const rim = new THREE.Mesh(rimGeometry, rimMaterial);
  rim.position.z = 0.02;
  head.add(rim);

  const center = new THREE.Mesh(centerGeometry, centerMaterial);
  center.rotation.x = Math.PI / 2;
  center.position.z = 0.04;
  head.add(center);

  const tip = new THREE.Vector3();

  function setGrow(grow: number): void {
    const g = THREE.MathUtils.clamp(grow, 0, 1);
    stem.material.uniforms.uGrow.value = g;
    // Head rides the top of the revealed stem, scaling in from a small bud.
    stem.curve.getPoint(g, tip);
    head.position.copy(tip);
    const headScale = THREE.MathUtils.smoothstep(g, 0.15, 0.9);
    head.scale.setScalar(headScale);
  }

  function setBloom(bloom: number): void {
    const b = THREE.MathUtils.clamp(bloom, 0, 1);
    const lengthScale = THREE.MathUtils.lerp(0.3, 1, b);
    const closedAngle = THREE.MathUtils.lerp(0.12, 1, b); // bunched bud → fully spread
    for (const petal of petals) {
      petal.rotation.z = petal.userData.targetAngle * closedAngle;
      petal.scale.set(1, lengthScale, 1);
    }
    const discScale = THREE.MathUtils.lerp(0.35, 1, b);
    center.scale.setScalar(discScale);
    rim.scale.setScalar(discScale);
  }

  function setOpacity(opacity: number): void {
    stem.material.uniforms.uOpacity.value = opacity;
    petalMaterial.opacity = opacity;
    centerMaterial.opacity = opacity;
    rimMaterial.opacity = opacity;
  }

  function dispose(): void {
    stem.mesh.geometry.dispose();
    stem.material.dispose();
    petalMaterial.dispose();
    centerMaterial.dispose();
    rimMaterial.dispose();
    // petalGeometry/rimGeometry/centerGeometry are shared — not disposed.
  }

  setGrow(0);
  setBloom(0);
  return { group, setGrow, setBloom, setOpacity, dispose };
}
