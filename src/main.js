import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { profile, sections } from './content.js';
import { Terrain } from './terrain.js';
import { planTrail } from './trails.js';
import { buildProps } from './props.js';
import { buildSky } from './sky.js';
import { createUI } from './ui.js';
import { createExplorer } from './explore.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.title = profile.name;

// ── easter egg: a secret word on the end of the URL opens the hideout ──
// GitHub Pages sends unknown paths to 404.html, which forwards here as ?go=<word>.
const SECRET = 0x6f8b37fb;
const hashWord = (w) => {
  let h = 0x811c9dc5;
  for (const c of w) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
};
const query = new URLSearchParams(location.search);
const forwarded = query.get('go');
const word = (forwarded ?? location.pathname.split('/').filter(Boolean).pop() ?? '').toLowerCase();
const secret = hashWord(word) === SECRET;
if (forwarded !== null) {
  query.delete('go');
  const rest = query.toString();
  history.replaceState(null, '', location.pathname + (secret ? word : '') + (rest ? `?${rest}` : '') + location.hash);
}
const homePath = () => (secret ? location.pathname.replace(/[^/]*\/?$/, '') : location.pathname);

const LANDMARKS = { village: 'The Cottage', music: 'The Keyboard Henge', code: 'The Stack', summit: 'The Summit' };

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
const trails = terrain.regions.map((r) => planTrail(terrain, r, sections[r.index].items ?? []));
const props = buildProps(terrain, trails);
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
    if (!explorer.active) controls.autoRotate = true;
  }, 4000);
}

// ── state ────────────────────────────────────────────────────
let hover = -1;
let flight = null;
let hideout = null;
let overviewDist = 3.2;
const shift = { x: 0, y: 0 };
const size = { w: 1, h: 1 };

const ui = createUI({
  profile,
  sections,
  accents: terrain.regions.map((r) => r.palette.accent),
  landmarks: terrain.regions.map((r) => LANDMARKS[r.kit] ?? 'The Landmark'),
  onSelect: (i) => landOn(i),
  onClose: () => ui.close(),
  onHover: (i) => setHover(i),
  explore: {
    onNext: () => explorer.step(1),
    onPrev: () => explorer.step(-1),
    onGoto: (k) => explorer.walkTo(k),
    onExit: () => explorer.exit(),
    onList: (i) => ui.open(i),
    onTravel: (j) => {
      ui.close();
      explorer.travel(j);
    },
  },
});

const explorer = createExplorer({
  canvas,
  camera,
  scene,
  terrain,
  trails,
  props,
  sky,
  ui,
  reduceMotion,
  orbitDistance: () => overviewDist,
  onEnter: (i) => {
    history.replaceState(null, '', `#${sections[i].id}`);
    ui.close();
    setHover(-1);
    controls.enabled = false;
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
  },
  onExit: (next) => {
    if (next >= 0) return; // heading straight to another island
    ui.close();
    history.replaceState(null, '', location.pathname + location.search);
    controls.enabled = true;
    scheduleAutoRotate();
  },
});

function setHover(i) {
  hover = i;
  ui.setHover(i);
  canvas.classList.toggle('pointing', i >= 0);
}

/** Fly down onto an island and start its trail. */
function landOn(i) {
  if (i < 0 || i >= sections.length) return;
  flight = null;
  explorer.enter(i);
}

// ── camera flights (orbit view) ──────────────────────────────
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

// ── picking (orbit view) ─────────────────────────────────────
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
  if (e.pointerType !== 'mouse' || explorer.active || hideout) return;
  setPointer(e);
  pointerInside = true;
  pointerDirty = true;
});
canvas.addEventListener('pointerleave', () => {
  pointerInside = false;
  if (!explorer.active) setHover(-1);
});
canvas.addEventListener('pointerdown', (e) => {
  if (explorer.active || hideout) return;
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
  if (i >= 0) landOn(i);
});

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (hideout) hideout.leave();
    else if (ui.panelOpen) ui.close();
    else explorer.exit();
    return;
  }
  if (!explorer.active || ui.panelOpen) return;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') explorer.step(1);
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') explorer.step(-1);
});

// ── layout ───────────────────────────────────────────────────
function resize() {
  size.w = innerWidth;
  size.h = innerHeight;
  renderer.setSize(size.w, size.h, false);
  camera.aspect = size.w / size.h;
  // Pull the camera back on narrow screens so the whole globe fits.
  const halfH = THREE.MathUtils.degToRad(40 / 2);
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
    ui.placeLabel(i, (proj.x * 0.5 + 0.5) * size.w, (-proj.y * 0.5 + 0.5) * size.h, opacity);
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

  // the explorer drives the camera while you're on an island (and the hideout while you're there)
  explorer.update(t, dt, size.w, size.h);
  if (hideout) hideout.update(t, dt);
  else if (!explorer.active) {
    if (flight) updateFlight(t);
    else controls.update(dt);
  }
  applyViewShift();

  if (pointerDirty && pointerInside && !flight && !down && !explorer.active && !hideout) {
    pointerDirty = false;
    const i = pick();
    if (i !== hover) setHover(i);
  }

  terrain.timeUniform.value = t;
  terrain.hoverUniform.value = hover;
  ocean.update(t);
  props.update(t, hover);
  sky.update(t, dt);
  if (!explorer.active && !hideout) updateLabels();

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ── intro: swoop in from deep space ──────────────────────────
const UP = new THREE.Vector3(0, 1, 0);
const fromHash = secret ? -1 : sections.findIndex((s) => `#${s.id}` === location.hash);
// for the hideout, come to rest with the ringed planet well off to the side, ready to turn and face it
const planetDir = sky.planet.position.clone().normalize();
const restDir = secret
  ? planetDir.clone().multiplyScalar(0.5).addScaledVector(new THREE.Vector3().crossVectors(planetDir, UP).normalize(), 0.85).addScaledVector(UP, 0.15).normalize()
  : terrain.regions[fromHash >= 0 ? fromHash : 0].center.clone().applyAxisAngle(UP, -0.3);
const startDir = restDir.clone().applyAxisAngle(UP, -0.6);
camera.position.copy(startDir).multiplyScalar(overviewDist * 2.6);
camera.lookAt(0, 0, 0);
flyTo(restDir, overviewDist, 2.4);
if (fromHash >= 0) setTimeout(() => landOn(fromHash), reduceMotion ? 0 : 2200);
if (secret) openHideout();
setTimeout(() => explorer.prebuild(), 3000);

function openHideout() {
  const loading = import('./secret.js'); // fetched only now, never on a normal visit
  controls.autoRotate = false;
  setTimeout(async () => {
    const { createHideout } = await loading;
    flight = null;
    controls.enabled = false;
    hideout = createHideout({
      scene,
      camera,
      canvas,
      planet: sky.planet,
      reduceMotion,
      homePosition: camera.position.clone(),
      onHome: () => {
        hideout = null;
        history.replaceState(null, '', homePath() + location.search);
        controls.enabled = true;
        scheduleAutoRotate();
      },
    });
  }, reduceMotion ? 0 : 2600);
}

addEventListener('hashchange', () => {
  if (hideout) return;
  const i = sections.findIndex((s) => `#${s.id}` === location.hash);
  if (i >= 0 && i !== explorer.region) landOn(i);
});

requestAnimationFrame(() => canvas.classList.add('ready'));
frame();
