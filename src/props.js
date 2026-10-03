import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { offsetDir, tangentBasis } from './terrain.js';
import { nearTrail } from './trails.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// ── shared materials & unit geometries ───────────────────────
const mats = new Map();
function mat(color, { glow = 0, metal = 0, rough = 0.8, side = THREE.FrontSide } = {}) {
  const key = [color, glow, metal, rough, side].join('|');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: rough,
      metalness: metal,
      emissive: glow ? color : '#000000',
      emissiveIntensity: glow,
      side,
    });
    mats.set(key, m);
  }
  return m;
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  taper4: new THREE.CylinderGeometry(0.35, 0.5, 1, 4),
  taper6: new THREE.CylinderGeometry(0.35, 0.5, 1, 6),
  cone6: new THREE.ConeGeometry(0.5, 1, 6),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  cup: new THREE.CylinderGeometry(0.5, 0.22, 1, 8),
  ico0: new THREE.IcosahedronGeometry(0.5, 0),
  ico1: new THREE.IcosahedronGeometry(0.5, 1),
  oct: new THREE.OctahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.07, 6, 24),
};

function part(geo, material, scale, position = [0, 0, 0], rotation) {
  const m = new THREE.Mesh(geo, material);
  if (typeof scale === 'number') m.scale.setScalar(scale);
  else m.scale.set(...scale);
  m.position.set(...position);
  if (rotation) m.rotation.set(...rotation);
  return m;
}

const WALLS = ['#fff3e0', '#ffe0c2', '#f6f1ff', '#ffd6d6'];
const ROOFS = ['#e8574a', '#4a6fe8', '#f2a541', '#8b5cf6'];

// ── small props ──────────────────────────────────────────────
function tree(rand, pal) {
  const g = new THREE.Group();
  const leaf = mat(pick(rand, pal.foliage));
  g.add(part(G.cyl6, mat('#7a5232'), [0.004, 0.012, 0.004], [0, 0.006, 0]));
  const kind = rand();
  if (kind < 0.45) {
    g.add(part(G.cone6, leaf, [0.022, 0.032, 0.022], [0, 0.026, 0]));
  } else if (kind < 0.75) {
    g.add(part(G.cone6, leaf, [0.024, 0.022, 0.024], [0, 0.02, 0]));
    g.add(part(G.cone6, leaf, [0.017, 0.018, 0.017], [0, 0.033, 0]));
  } else {
    g.add(part(G.ico0, leaf, [0.024, 0.026, 0.024], [0, 0.023, 0]));
  }
  g.scale.setScalar(0.75 + rand() * 0.6);
  return g;
}

function house(rand) {
  const g = new THREE.Group();
  const w = 0.013 + rand() * 0.006, h = 0.011 + rand() * 0.006;
  g.add(part(G.box, mat(pick(rand, WALLS)), [w, h, w], [0, h / 2, 0]));
  g.add(part(G.cone4, mat(pick(rand, ROOFS)), [w * 1.5, 0.012, w * 1.5], [0, h + 0.006, 0], [0, Math.PI / 4, 0]));
  return g;
}

function note(rand, pal, anims) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const m = mat(pick(rand, ['#2b1d4f', pal.accent, '#ffffff']));
  inner.add(part(G.ico1, m, [0.016, 0.011, 0.012], [0, 0.006, 0], [0, 0, 0.35]));
  inner.add(part(G.box, m, [0.0025, 0.04, 0.0025], [0.007, 0.026, 0]));
  inner.add(part(G.box, m, [0.012, 0.004, 0.003], [0.012, 0.042, 0], [0, 0, -0.6]));
  const ph = rand() * TAU;
  anims.push((t) => {
    inner.position.y = 0.008 + Math.sin(t * 1.5 + ph) * 0.004;
    inner.rotation.y = t * 0.4 + ph;
  });
  return g;
}

function metronome(rand, pal, anims) {
  const g = new THREE.Group();
  g.add(part(G.taper4, mat(pick(rand, ['#6b3fa0', '#2b1d4f', '#ff8f6b'])), [0.024, 0.045, 0.024], [0, 0.0225, 0], [0, Math.PI / 4, 0]));
  const pend = new THREE.Group();
  pend.position.set(0, 0.012, 0.011);
  pend.add(part(G.box, mat('#fff0f7'), [0.0018, 0.036, 0.0018], [0, 0.018, 0]));
  pend.add(part(G.box, mat(pal.accent, { glow: 0.3 }), [0.006, 0.005, 0.003], [0, 0.026, 0]));
  g.add(pend);
  const ph = rand() * TAU;
  anims.push((t) => (pend.rotation.z = Math.sin(t * 3 + ph) * 0.5));
  return g;
}

function crystal(rand, pal, anims) {
  const g = new THREE.Group();
  const m = mat(pick(rand, [pal.accent, '#7cf7ff', '#b18cff']), { glow: 0.45, rough: 0.3 });
  const main = part(G.oct, m, [0.016, 0.042, 0.016], [0, 0.024, 0]);
  g.add(main);
  g.add(part(G.oct, m, [0.009, 0.022, 0.009], [0.011, 0.011, 0.003], [0, 0, -0.5]));
  g.add(part(G.oct, m, [0.008, 0.018, 0.008], [-0.009, 0.009, -0.004], [0.3, 0, 0.5]));
  const ph = rand() * TAU;
  anims.push((t) => (main.rotation.y = t * 0.6 + ph));
  return g;
}

function server(rand, pal) {
  const g = new THREE.Group();
  const h = 0.024 + rand() * 0.022;
  g.add(part(G.box, mat('#1d2b53'), [0.016, h, 0.016], [0, h / 2, 0]));
  const stripe = mat(pick(rand, [pal.accent, '#3fe0c5', '#ff5fa2']), { glow: 0.9 });
  for (let y = 0.006; y < h - 0.003; y += 0.008) {
    g.add(part(G.box, stripe, [0.012, 0.0018, 0.0012], [0, y, 0.0082]));
  }
  return g;
}

function trophy(rand) {
  const g = new THREE.Group();
  const gold = mat('#ffcc33', { metal: 0.35, rough: 0.35 });
  g.add(part(G.box, mat('#5a3d2b'), [0.013, 0.005, 0.013], [0, 0.0025, 0]));
  g.add(part(G.cyl6, gold, [0.003, 0.008, 0.003], [0, 0.009, 0]));
  g.add(part(G.cup, gold, [0.017, 0.014, 0.017], [0, 0.02, 0]));
  g.add(part(G.torus, gold, 0.008, [0.009, 0.021, 0]));
  g.add(part(G.torus, gold, 0.008, [-0.009, 0.021, 0]));
  g.scale.setScalar(1 + rand() * 0.3);
  return g;
}

function obelisk(rand, pal) {
  const g = new THREE.Group();
  const h = 0.04 + rand() * 0.02;
  g.add(part(G.taper4, mat(pick(rand, ['#f5e6c8', '#e8a33d', '#ffffff'])), [0.012, h, 0.012], [0, h / 2, 0]));
  g.add(part(G.cone4, mat(pal.accent, { glow: 0.3 }), [0.0085, 0.01, 0.0085], [0, h + 0.005, 0]));
  return g;
}

// ── landmarks (one per island, at its center) ────────────────
function cottage(rand, pal, anims) {
  const g = new THREE.Group();
  g.add(part(G.box, mat('#fff3e0'), [0.034, 0.024, 0.034], [0, 0.012, 0]));
  g.add(part(G.cone4, mat('#e8574a'), [0.052, 0.024, 0.052], [0, 0.036, 0], [0, Math.PI / 4, 0]));
  g.add(part(G.box, mat('#7a4a2a'), [0.008, 0.013, 0.002], [0, 0.0065, 0.0171]));
  g.add(part(G.box, mat('#ffd166', { glow: 0.6 }), [0.007, 0.007, 0.002], [0.01, 0.014, 0.0171]));
  g.add(part(G.box, mat('#9a5b3d'), [0.006, 0.016, 0.006], [0.009, 0.042, -0.005]));

  // windmill
  const mill = new THREE.Group();
  mill.position.set(0.05, 0, -0.01);
  mill.add(part(G.taper6, mat('#ffe0c2'), [0.016, 0.055, 0.016], [0, 0.0275, 0]));
  mill.add(part(G.cone6, mat('#4a6fe8'), [0.016, 0.013, 0.016], [0, 0.061, 0]));
  const blades = new THREE.Group();
  blades.position.set(0, 0.052, 0.009);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2;
    arm.add(part(G.box, mat(k % 2 ? '#fff3e0' : pal.accent), [0.007, 0.032, 0.001], [0, 0.017, 0]));
    blades.add(arm);
  }
  mill.add(blades);
  g.add(mill);
  anims.push((t) => (blades.rotation.z = -t * 1.2));
  return g;
}

function pianoHenge(rand, pal, anims) {
  const g = new THREE.Group();
  const white = mat('#fffaf2', { rough: 0.5 });
  const black = mat('#1d1430', { rough: 0.4 });
  const R = 0.052, N = 14;
  const hasBlack = [1, 1, 0, 1, 1, 1, 0]; // black key after C D (not E) F G A (not B), like a real keyboard
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    g.add(part(G.box, white, [0.012, 0.036, 0.006], [R * Math.cos(a), 0.018, R * Math.sin(a)], [0, -a - Math.PI / 2, 0]));
    if (hasBlack[i % 7]) {
      const am = ((i + 0.5) / N) * TAU;
      g.add(part(G.box, black, [0.02, 0.006, 0.007], [R * Math.cos(am), 0.039, R * Math.sin(am)], [0, -am - Math.PI / 2, 0]));
    }
  }
  const big = note(rand, { accent: pal.accent }, anims);
  big.scale.setScalar(1.8);
  big.traverse((o) => o.isMesh && (o.material = mat(pal.accent, { glow: 0.35 })));
  g.add(big);
  return g;
}

function tower(rand, pal, anims) {
  const g = new THREE.Group();
  const h = 0.016;
  for (let i = 0; i < 6; i++) {
    const s = 0.05 * (1 - i * 0.13);
    g.add(part(G.box, mat(i % 2 ? pal.bands[2] : '#1d2b53'), [s, h, s], [0, i * h + h / 2, 0], [0, i * 0.3, 0]));
    g.add(part(G.box, mat(pal.accent, { glow: 0.9 }), [s * 1.02, 0.0015, s * 1.02], [0, i * h + h - 0.002, 0], [0, i * 0.3, 0]));
  }
  const orbit = new THREE.Group();
  orbit.position.y = 0.075;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    orbit.add(part(G.box, mat(pick(rand, [pal.accent, '#ff5fa2', '#ffd23f']), { glow: 0.7 }), 0.008, [Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045], [0.6, 0.6, 0]));
  }
  g.add(orbit);
  anims.push((t) => {
    orbit.rotation.y = t * 0.8;
    orbit.children.forEach((c, k) => (c.rotation.x = t * 1.5 + k));
  });
  return g;
}

function summitFlag(rand, pal, anims) {
  const g = new THREE.Group();
  g.add(part(G.cyl6, mat('#e9e9f0'), [0.003, 0.065, 0.003], [0, 0.0325, 0]));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.032, -0.009);
  shape.lineTo(0, -0.019);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat('#e8574a', { side: THREE.DoubleSide }));
  const holder = new THREE.Group();
  holder.position.set(0, 0.064, 0);
  holder.add(flag);
  g.add(holder);
  const stone = mat('#9a8fa8');
  g.add(part(G.ico0, stone, [0.018, 0.012, 0.018], [0, 0.003, 0]));
  g.add(part(G.ico0, stone, [0.012, 0.009, 0.012], [0.012, 0.002, 0.006]));
  g.add(part(G.ico0, stone, [0.01, 0.008, 0.01], [-0.01, 0.002, -0.008]));
  anims.push((t) => (holder.rotation.y = Math.sin(t * 2.2) * 0.3));
  return g;
}

// Which landmark + props each kit gets: [builder, count, options]
const KITS = {
  village: {
    landmark: cottage,
    scatter: [[tree, 34, { minDist: 0.03 }], [house, 9, { minDist: 0.05, maxH: 0.05 }]],
  },
  music: {
    landmark: pianoHenge,
    scatter: [[tree, 20], [note, 7, { minDist: 0.06 }], [metronome, 5, { minDist: 0.06 }]],
  },
  code: {
    landmark: tower,
    scatter: [[crystal, 14, { minDist: 0.05 }], [server, 10, { minDist: 0.045 }], [tree, 10]],
  },
  summit: {
    landmark: summitFlag,
    scatter: [[tree, 26, { maxH: 0.06 }], [trophy, 6, { minDist: 0.06, maxH: 0.09 }], [obelisk, 6, { minDist: 0.06 }]],
  },
};

// ── trail exhibits (local +z faces the visitor) ──────────────
function signpost(rand, pal) {
  const g = new THREE.Group();
  g.add(part(G.box, mat('#a0673d'), [0.0022, 0.024, 0.0022], [0, 0.012, 0]));
  g.add(part(G.box, mat('#f3dcb2'), [0.02, 0.009, 0.0016], [0, 0.02, 0.0016]));
  g.add(part(G.box, mat(pal.accent), [0.02, 0.0018, 0.0018], [0, 0.0254, 0.0016]));
  g.add(part(G.box, mat('#c98b4f'), [0.013, 0.005, 0.0014], [0.003, 0.012, -0.0012], [0, 0, -0.12]));
  return g;
}

function keyStone(rand, pal) {
  const g = new THREE.Group();
  g.add(part(G.box, mat(pal.accent), [0.016, 0.003, 0.009], [0, 0.0015, 0]));
  g.add(part(G.box, mat('#fffaf2', { rough: 0.5 }), [0.011, 0.028, 0.005], [0, 0.017, 0]));
  g.add(part(G.box, mat('#1d1430', { rough: 0.4 }), [0.006, 0.016, 0.0015], [0, 0.022, 0.0031]));
  return g;
}

function terminal(rand, pal) {
  const g = new THREE.Group();
  const dark = mat('#1d2b53');
  g.add(part(G.cyl6, dark, [0.003, 0.013, 0.003], [0, 0.0065, 0]));
  g.add(part(G.box, dark, [0.01, 0.002, 0.008], [0, 0.001, 0]));
  const screen = new THREE.Group();
  screen.position.set(0, 0.019, 0);
  screen.rotation.x = -0.25;
  screen.add(part(G.box, dark, [0.024, 0.015, 0.002]));
  screen.add(part(G.box, mat(pal.accent, { glow: 0.8 }), [0.02, 0.011, 0.0006], [0, 0, 0.0012]));
  g.add(screen);
  return g;
}

function cairn(rand, pal) {
  const g = new THREE.Group();
  const stone = mat('#a99cb5');
  g.add(part(G.ico0, stone, [0.013, 0.008, 0.013], [0, 0.003, 0]));
  g.add(part(G.ico0, mat('#8f839c'), [0.01, 0.007, 0.01], [0, 0.009, 0], [0, 0.6, 0]));
  g.add(part(G.ico0, stone, [0.007, 0.006, 0.007], [0, 0.014, 0], [0, 1.1, 0]));
  g.add(part(G.cyl6, mat('#e9e9f0'), [0.0012, 0.024, 0.0012], [0.007, 0.012, 0]));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.011, -0.003);
  shape.lineTo(0, -0.006);
  g.add(part(new THREE.ShapeGeometry(shape), mat(pal.accent, { side: THREE.DoubleSide }), 1, [0.007, 0.024, 0]));
  return g;
}

function welcomeArch(rand, pal) {
  const g = new THREE.Group();
  const post = mat('#fffaf2');
  g.add(part(G.box, post, [0.003, 0.03, 0.003], [-0.013, 0.015, 0]));
  g.add(part(G.box, post, [0.003, 0.03, 0.003], [0.013, 0.015, 0]));
  g.add(part(G.box, mat(pal.accent, { glow: 0.2 }), [0.033, 0.005, 0.004], [0, 0.031, 0]));
  g.add(part(G.oct, mat(pal.accent, { glow: 0.5 }), [0.006, 0.009, 0.006], [0, 0.039, 0]));
  return g;
}

const EXHIBITS = { village: signpost, music: keyStone, code: terminal, summit: cairn };

// ── placement helpers ────────────────────────────────────────
function randomNear(center, maxAngle, rand) {
  return offsetDir(center, tangentBasis(center), rand() * TAU, maxAngle * Math.sqrt(rand()));
}

function isFlat(terrain, dir, h) {
  const [t1, t2] = tangentBasis(dir);
  const e = 0.012;
  const h1 = terrain.sample(dir.clone().addScaledVector(t1, e).normalize()).h;
  const h2 = terrain.sample(dir.clone().addScaledVector(t2, e).normalize()).h;
  return Math.abs(h1 - h) < 0.006 && Math.abs(h2 - h) < 0.006;
}

function placeAt(obj, dir, h, spin) {
  obj.position.copy(dir).multiplyScalar(1 + h - 0.003);
  obj.quaternion.setFromUnitVectors(UP, dir);
  obj.rotateY(spin);
}

/** Stand `obj` on the ground at `dir`, turned so its +z side faces `toward`. */
function placeFacing(obj, dir, h, toward) {
  const fwd = new THREE.Vector3().subVectors(toward, dir);
  fwd.addScaledVector(dir, -fwd.dot(dir)).normalize();
  const x = new THREE.Vector3().crossVectors(dir, fwd);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dir, fwd));
  obj.position.copy(dir).multiplyScalar(1 + h - 0.002);
}

function scatter(terrain, group, anims, rand, { center, size, owner, palette, trail }, build, count, opts = {}) {
  const { minDist = 0.035, avoid = 0.1, minH = 0.0095, maxH = 1 } = opts;
  const placed = [];
  for (let tries = 0; placed.length < count && tries < count * 80; tries++) {
    const dir = center ? randomNear(center, size, rand) : randomNear(UP, Math.PI, rand);
    if (center && dir.angleTo(center) < avoid) continue;
    const s = terrain.sample(dir);
    if (!s.land || s.owner !== owner || s.h < minH || s.h > maxH) continue;
    if (placed.some((p) => p.angleTo(dir) < minDist)) continue;
    if (trail && nearTrail(trail, dir)) continue;
    if (!isFlat(terrain, dir, s.h)) continue;
    placed.push(dir);
    const obj = build(rand, palette, anims);
    placeAt(obj, dir, s.h, rand() * TAU);
    group.add(obj);
  }
}

function beacon(color) {
  const g = new THREE.Group();
  const gem = part(G.oct, mat(color, { glow: 0.9, rough: 0.2 }), [0.036, 0.05, 0.036]);
  const ring = part(G.torus, mat(color, { glow: 0.6 }), 0.06, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  g.add(gem, ring, hit);
  return { group: g, gem, ring, hit };
}

/** Stepping stones, stop markers, and exhibits for one island's trail. */
function buildTrail(terrain, r, trail, group) {
  const rand = mulberry32(77 + r.index);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitGeo = new THREE.SphereGeometry(0.014, 8, 6);
  const hits = [];
  const rings = [];

  // stepping stones every other path point, jittered a little
  const idx = [];
  for (let i = 0; i < trail.path.length; i += 2) idx.push(i);
  const stones = new THREE.InstancedMesh(G.cyl6, mat(r.palette.path, { rough: 1 }), idx.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qs = new THREE.Quaternion();
  const s = new THREE.Vector3(), p = new THREE.Vector3();
  idx.forEach((i, k) => {
    const [a, b] = tangentBasis(trail.path[i]);
    const d = trail.path[i].clone()
      .addScaledVector(a, (rand() - 0.5) * 0.003)
      .addScaledVector(b, (rand() - 0.5) * 0.003)
      .normalize();
    const h = terrain.sample(d).h;
    p.copy(d).multiplyScalar(1 + h + 0.0003);
    q.setFromUnitVectors(UP, d).multiply(qs.setFromAxisAngle(UP, rand() * TAU));
    const w = 0.005 + rand() * 0.002;
    s.set(w, 0.0016, w * (0.8 + rand() * 0.3));
    stones.setMatrixAt(k, m.compose(p, q, s));
  });
  group.add(stones);

  const ringMat = mat(r.palette.accent, { glow: 0.7 });
  trail.stops.forEach((stop, k) => {
    // glowing ring on the ground where you stand
    const ring = part(G.torus, ringMat, 0.009, [0, 0, 0], [Math.PI / 2, 0, 0]);
    const holder = new THREE.Group();
    placeAt(holder, stop.dir, terrain.sample(stop.dir).h + 0.0035, 0);
    holder.add(ring);
    group.add(holder);
    rings.push(ring);

    const targets = [stop.dir];
    if (stop.kind !== 'finale') {
      const build = stop.kind === 'welcome' ? welcomeArch : EXHIBITS[r.kit] ?? signpost;
      const ex = build(rand, r.palette);
      placeFacing(ex, stop.exhibitDir, terrain.sample(stop.exhibitDir).h, stop.dir);
      group.add(ex);
      targets.push(stop.exhibitDir);
    }
    for (const d of targets) {
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.copy(d).multiplyScalar(1 + terrain.sample(d).h + 0.008);
      hit.userData = { region: r.index, stop: k };
      group.add(hit);
      hits.push(hit);
    }
  });

  return { hits, rings };
}

// ── public ───────────────────────────────────────────────────
export function buildProps(terrain, trails) {
  const group = new THREE.Group();
  const anims = [];
  const beacons = [];
  const anchors = [];
  const trailProps = [];

  for (const r of terrain.regions) {
    const rand = mulberry32(1000 + r.index * 77);
    const kit = KITS[r.kit] ?? KITS.village;
    const h = terrain.sample(r.center).h;

    const lm = kit.landmark(rand, r.palette, anims);
    placeAt(lm, r.center, h, rand() * TAU);
    group.add(lm);

    const trail = trails[r.index];
    trailProps.push(buildTrail(terrain, r, trail, group));

    const area = { center: r.center, size: r.size * 1.1, owner: r.index, palette: r.palette, trail };
    for (const [build, count, opts] of kit.scatter) scatter(terrain, group, anims, rand, area, build, count, opts);

    const b = beacon(r.palette.accent);
    b.group.position.copy(r.center).multiplyScalar(1 + h + 0.13);
    b.group.quaternion.setFromUnitVectors(UP, r.center);
    b.hit.userData.region = r.index;
    b.phase = r.index * 1.7;
    group.add(b.group);
    beacons.push(b);
    anchors.push(r.center.clone().multiplyScalar(1 + h + 0.2));
  }

  // trees on the little unnamed islands
  const wildRand = mulberry32(4242);
  scatter(terrain, group, anims, wildRand, { owner: -1, palette: terrain.wild.palette }, tree, 40, { minDist: 0.03 });

  return {
    group,
    anchors,
    hitTargets: beacons.map((b) => b.hit),
    trails: trailProps,
    update(t, focus) {
      for (const a of anims) a(t);
      beacons.forEach((b, i) => {
        b.gem.rotation.y = t * 1.2 + b.phase;
        b.gem.position.y = Math.sin(t * 2 + b.phase) * 0.008;
        b.ring.rotation.z = -t * 0.5;
        const target = i === focus ? 1.45 : 1;
        b.group.scale.setScalar(THREE.MathUtils.lerp(b.group.scale.x, target, 0.12));
      });
      for (const tp of trailProps) {
        tp.rings.forEach((ring, k) => ring.scale.setScalar(0.009 * (1 + Math.sin(t * 3 + k) * 0.12)));
      }
    },
  };
}
