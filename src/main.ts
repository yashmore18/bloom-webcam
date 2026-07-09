import "./style.css";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { HandTracking } from "./hand/hand-tracking";
import { PinchOverlay } from "./hand/pinch-overlay";
import { SunflowerTemplate } from "./plant/plant-manager";
import { Recorder } from "./recorder";
import type { HandState, TemplateModule } from "./types";

// ── DOM ───────────────────────────────────────────────────────────────────
const mount = document.getElementById("scene-mount")!;
const permissionBtn = document.getElementById("permission-btn") as HTMLButtonElement;
const recordBtn = document.getElementById("record-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const downloadLink = document.getElementById("download-link") as HTMLAnchorElement;
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

// ── bloom postprocessing (the glow aesthetic) ──────────────────────────────
// The webcam plane is dimmed (below) so the threshold cleanly separates the
// bright plants/skeleton (which bloom) from the video (which mostly doesn't).
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, // strength — dialed down so bloomed flowers stay legible, not washed out
  0.5, // radius
  0.55 // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

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
const overlay = new PinchOverlay();
overlay.init(scene);
let tracking = false;

// Template registry — one entry today (the grow/bloom sunflower). Adding a
// second template later means adding an entry here; the loop stays the same.
const templates: { name: string; module: TemplateModule }[] = [
  { name: "sunflower", module: new SunflowerTemplate() },
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
    // Dim the webcam so it sits below the bloom threshold and the glowing
    // plants/skeleton pop against it.
    color: 0x8a8a8a,
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
  enableCamera()
    .then(() => {
      recordBtn.disabled = false;
    })
    .catch((err) => {
      console.error("Camera permission failed:", err);
      permissionBtn.textContent = "Camera denied — retry";
    });
});

// ── recording ─────────────────────────────────────────────────────────────
const recorder = new Recorder(renderer.domElement, (url) => {
  downloadLink.href = url;
  downloadLink.hidden = false;
});

recordBtn.addEventListener("click", () => {
  recorder.start();
  recordBtn.disabled = true;
  stopBtn.disabled = false;
  downloadLink.hidden = true;
});

stopBtn.addEventListener("click", () => {
  recorder.stop();
  stopBtn.disabled = true;
  recordBtn.disabled = false;
});

// ── resize ────────────────────────────────────────────────────────────────
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
}
window.addEventListener("resize", resize);
resize();

// ── render loop ───────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  const states = debug.forceStates ?? (tracking ? handTracking.getStates(performance.now()) : []);
  overlay.update(states);
  activeTemplate.update(states, dt);

  composer.render();
}
animate();
