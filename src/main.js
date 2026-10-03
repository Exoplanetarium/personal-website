import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { profile, sections } from './content.js';
import { Terrain } from './terrain.js';
import { buildProps } from './props.js';
import { buildSky } from './sky.js';
import { createUI } from './ui.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.title = profile.name;

// ── renderer / scene / camera ────────────────────────────────
const canvas = document.getElementById('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
scene.add(camera);

scene.add(new THREE.HemisphereLight('#fff1d6', '#5a3f9c', 1.3));
// Lights ride along with the camera so whichever side you look at is nicely lit.
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.position.set(-3, 2.5, 3);
camera.add(sun);
const rim = new THREE.DirectionalLight('#7fd4ff', 1.0);
rim.position.set(3, -1.5, -1);
camera.add(rim);

// ── world ────────────────────────────────────────────────────
const terrain = new Terrain(sections);
const land = terrain.buildMesh();
const ocean = terrain.buildOcean();
const props = buildProps(terrain);
const sky = buildSky(scene);
scene.add(land.mesh, ocean.mesh, props.group);

// ── controls ─────────────────────────────────────────────────
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.6;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.45;

let resumeTimer;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
});
controls.addEventListener('end', scheduleAutoRotate);
function scheduleAutoRotate() {
  clearTimeout(resumeTimer);
  if (reduceMotion) return;
  resumeTimer = setTimeout(() => {
    if (active < 0) controls.autoRotate = true;
  }, 4000);
}

// ── state ────────────────────────────────────────────────────
let active = -1;
let hover = -1;
let flight = null;
let overviewDist = 3.2;
const shift = { x: 0, y: 0 };
const size = { w: 1, h: 1 };

const ui = createUI({
  profile,
  sections,
  accents: terrain.regions.map((r) => r.palette.accent),
  onSelect: (i) => openSection(i),
  onClose: () => closeSection(),
  onHover: (i) => setHover(i),
});

function setHover(i) {
  hover = i;
  ui.setHover(i);
  canvas.classList.toggle('pointing', i >= 0);
}

function openSection(i) {
  if (i < 0 || i >= sections.length) return;
  active = i;
  ui.open(i);
  history.replaceState(null, '', `#${sections[i].id}`);
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  flyTo(terrain.regions[i].center, overviewDist * 0.72);
}

function closeSection() {
  if (active < 0) return;
  active = -1;
  ui.close();
  history.replaceState(null, '', location.pathname + location.search);
  flyTo(camera.position.clone().normalize(), overviewDist, 1.0);
  scheduleAutoRotate();
}

// ── camera flights ───────────────────────────────────────────
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const qIdentity = new THREE.Quaternion();

function flyTo(dir, dist, dur = 1.6) {
  const from = camera.position.clone();
  flight = {
    t0: elapsed,
    dur: reduceMotion ? 0.001 : dur,
    fromDir: from.clone().normalize(),
    fromDist: from.length(),
    q: new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), dir.clone().normalize()),
    toDist: dist,
  };
  controls.enabled = false;
}

function updateFlight(t) {
  const k = Math.min((t - flight.t0) / flight.dur, 1);
  const e = ease(k);
  const q = qIdentity.clone().slerp(flight.q, e);
  const d = THREE.MathUtils.lerp(flight.fromDist, flight.toDist, e) + Math.sin(k * Math.PI) * 0.3;
  camera.position.copy(flight.fromDir).applyQuaternion(q).multiplyScalar(d);
  camera.lookAt(0, 0, 0);
  if (k >= 1) {
    flight = null;
    controls.enabled = true;
  }
}

// ── picking ──────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickables = [land.mesh, ...props.hitTargets];
let pointerDirty = false;
let pointerInside = false;
let down = null;

function setPointer(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

function pick() {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (!hit) return -1;
  if (hit.object === land.mesh) return land.faceRegion[hit.faceIndex];
  return hit.object.userData.region ?? -1;
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  setPointer(e);
  pointerInside = true;
  pointerDirty = true;
});
canvas.addEventListener('pointerleave', () => {
  pointerInside = false;
  setHover(-1);
});
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 500;
  down = null;
  if (moved > 6 || !quick) return;
  setPointer(e);
  const i = pick();
  if (i >= 0) openSection(i);
});

// ── layout ───────────────────────────────────────────────────
function resize() {
  size.w = innerWidth;
  size.h = innerHeight;
  renderer.setSize(size.w, size.h, false);
  camera.aspect = size.w / size.h;
  // Pull the camera back on narrow screens so the whole globe fits.
  const halfH = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfW = Math.atan(Math.tan(halfH) * camera.aspect);
  overviewDist = Math.max(3.2, 1.4 / Math.sin(Math.min(halfW, halfH)));
  controls.minDistance = 1.6;
  controls.maxDistance = overviewDist * 1.6;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function applyViewShift() {
  const target = ui.viewShift();
  shift.x += (target.x - shift.x) * 0.08;
  shift.y += (target.y - shift.y) * 0.08;
  if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5) {
    if (camera.view?.enabled) camera.clearViewOffset();
  } else {
    camera.setViewOffset(size.w, size.h, shift.x, shift.y, size.w, size.h);
  }
}

// ── labels ───────────────────────────────────────────────────
const proj = new THREE.Vector3();
const camDir = new THREE.Vector3();
function updateLabels() {
  camDir.copy(camera.position).normalize();
  props.anchors.forEach((anchor, i) => {
    const facing = anchor.clone().normalize().dot(camDir);
    const opacity = THREE.MathUtils.smoothstep(facing, 0.25, 0.55);
    proj.copy(anchor).project(camera);
    ui.placeLabel(i, (proj.x * 0.5 + 0.5) * size.w, (-proj.y * 0.5 + 0.5) * size.h, i === active ? 0 : opacity);
  });
}

// ── loop ─────────────────────────────────────────────────────
let elapsed = 0;
let last = performance.now();

function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;
  const t = elapsed;

  if (flight) updateFlight(t);
  else controls.update(dt);
  applyViewShift();

  if (pointerDirty && pointerInside && !flight && !down) {
    pointerDirty = false;
    const i = pick();
    if (i !== hover) setHover(i);
  }

  terrain.timeUniform.value = t;
  terrain.hoverUniform.value = hover >= 0 ? hover : active;
  ocean.update(t);
  props.update(t, hover >= 0 ? hover : active);
  sky.update(t, dt);
  updateLabels();

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ── intro: swoop in from deep space ──────────────────────────
const fromHash = sections.findIndex((s) => `#${s.id}` === location.hash);
const startDir = terrain.regions[fromHash >= 0 ? fromHash : 0].center.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.9);
camera.position.copy(startDir).multiplyScalar(overviewDist * 2.6);
camera.lookAt(0, 0, 0);
flyTo(startDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6), overviewDist, 2.4);
if (fromHash >= 0) setTimeout(() => openSection(fromHash), reduceMotion ? 0 : 2200);

addEventListener('hashchange', () => {
  const i = sections.findIndex((s) => `#${s.id}` === location.hash);
  if (i >= 0 && i !== active) openSection(i);
});

requestAnimationFrame(() => canvas.classList.add('ready'));
frame();
