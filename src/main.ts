import "./style.css";
import * as THREE from "three";
import { HandTracking } from "./hand/hand-tracking";
import { HandSkeleton } from "./hand/hand-skeleton";
import { PlantTemplate } from "./plant/plant-manager";
import type { HandState, TemplateModule } from "./types";

// ── DOM ───────────────────────────────────────────────────────────────────
const mount = document.getElementById("scene-mount")!;
const permissionBtn = document.getElementById("permission-btn") as HTMLButtonElement;
const hint = document.getElementById("hint") as HTMLParagraphElement;

// ── three.js core ─────────────────────────────────────────────────────────
// Orthographic [-1,1] frustum on the XY plane keeps hand coords (also [-1,1])
// a direct 1:1 mapping into world space — no projection math per frame.
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
mount.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
keyLight.position.set(0.5, 1, 1);
scene.add(keyLight);

// ── mirrored webcam background ────────────────────────────────────────────
// A hidden <video> feeds a VideoTexture on a full-frustum plane. Rendering the
// webcam inside the three.js scene (rather than a separate DOM <video>) means
// there is a single canvas to capture when recording (Part 4).
const video = document.createElement("video");
video.autoplay = true;
video.playsInline = true;
video.muted = true;

let bgMesh: THREE.Mesh | null = null;

// ── interaction + overlays ────────────────────────────────────────────────
const handTracking = new HandTracking();
const skeleton = new HandSkeleton();
skeleton.init(scene);
let tracking = false;

// Template registry — one entry today (the L-system plant). Adding a second
// generative template later means adding an entry here; the loop stays the same.
const templates: { name: string; module: TemplateModule }[] = [
  { name: "plant", module: new PlantTemplate() },
];
const activeTemplate = templates[0].module;
activeTemplate.init(scene);

// Dev-only debug hook: lets the headless test harness inject fake hand states
// without a real camera. Guarded by import.meta.env.DEV so it's stripped from
// production builds. (Route overrides through this plain object — reassigning
// ES-module namespace exports from page context silently no-ops.)
const debug: { forceStates: HandState[] | null } = { forceStates: null };
if (import.meta.env.DEV) {
  (window as unknown as { __bloomDebug: typeof debug }).__bloomDebug = debug;
}

function buildVideoBackground(): void {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.PlaneGeometry(2, 2);
  // Mirror horizontally for a natural selfie view (hand coords are mirrored to match).
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
  });
  bgMesh = new THREE.Mesh(geometry, material);
  bgMesh.renderOrder = -1;
  scene.add(bgMesh);
}

// ── camera permission flow ────────────────────────────────────────────────
async function enableCamera(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = stream;
  await video.play();
  buildVideoBackground();
  permissionBtn.disabled = true;
  permissionBtn.textContent = "Camera on";
  hint.hidden = false;

  await handTracking.init(video);
  tracking = true;
}

permissionBtn.addEventListener("click", () => {
  enableCamera().catch((err) => {
    console.error("Camera permission failed:", err);
    permissionBtn.textContent = "Camera denied — retry";
  });
});

// ── resize ────────────────────────────────────────────────────────────────
function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);
resize();

// ── render loop ───────────────────────────────────────────────────────────
// Templates and hand-tracking slot into this loop in Parts 2–3; for now it
// just renders the mirrored webcam so the foundation is verifiable on its own.
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  const states = debug.forceStates ?? (tracking ? handTracking.getStates(performance.now()) : []);
  skeleton.update(states);
  activeTemplate.update(states, dt);

  renderer.render(scene, camera);
}
animate();
