import * as THREE from 'three';
import { tangentBasis } from './terrain.js';

// A small glowing glyph hidden on each island, just behind one of the trail stops, so it only
// turns up if you stop and look around. Little dots under each glyph give its place in the word.

// 3×5 pixel glyphs, one per island in section order (kept as bitmaps so the word isn't in the source).
const GLYPHS = [
  ['###', '.#.', '.#.', '.#.', '.#.'],
  ['##.', '#.#', '##.', '#.#', '#.#'],
  ['###', '#..', '##.', '#..', '###'],
  ['#.#', '#.#', '##.', '#.#', '#.#'],
];

const PX = 0.0019; // pixel size
const LIFT = 0.004; // how far the glyph floats above the ground
const EYE = 0.013; // matches the explorer's eye height

const box = new THREE.BoxGeometry(1, 1, 1);
const glyphMat = new THREE.MeshStandardMaterial({ color: '#ff8a5c', emissive: '#ff8a5c', emissiveIntensity: 0.8, flatShading: true, roughness: 0.4 });
const pipMat = new THREE.MeshStandardMaterial({ color: '#ffd29a', emissive: '#ffd29a', emissiveIntensity: 0.6, flatShading: true });

function glyph(rows, order) {
  const g = new THREE.Group();
  const w = rows[0].length;
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c !== '#') return;
      const m = new THREE.Mesh(box, glyphMat);
      m.scale.set(PX * 0.92, PX * 0.92, PX * 0.6);
      m.position.set((x - (w - 1) / 2) * PX, LIFT + (rows.length - 1 - y) * PX, 0);
      g.add(m);
    });
  });
  for (let i = 0; i <= order; i++) {
    const m = new THREE.Mesh(box, pipMat);
    m.scale.setScalar(PX * 0.45);
    m.position.set((i - order / 2) * PX * 0.9, LIFT - PX * 0.9, 0);
    g.add(m);
  }
  return g;
}

/**
 * Hide region `r`'s glyph near one of its trail stops: off the path, on the ground behind you
 * (100–165° away from the exhibit you arrive facing), with a clear line of sight from the stop.
 * Returns { obj, dir, anim } or null if the island has no glyph.
 */
export function buildClue(terrain, r, trail) {
  const rows = GLYPHS[r.index];
  if (!rows) return null;

  const stops = trail.stops;
  const items = Math.max(1, stops.length - 2);
  const stop = stops[Math.min(stops.length - 2, 1 + ((r.index * 2) % items))] ?? stops[0];
  const at = stop.dir;
  const eye = at.clone().multiplyScalar(1 + trail.eyeH[stop.pathIdx] + EYE);

  const [t1] = tangentBasis(at);
  const toward = stop.look.clone().sub(eye);
  const fwd = toward.addScaledVector(at, -toward.dot(at));
  if (fwd.lengthSq() < 1e-10) fwd.copy(t1);
  fwd.normalize();
  const side = new THREE.Vector3().crossVectors(at, fwd);

  const ok = (d) => {
    const s = terrain.sample(d);
    return s.land && s.owner === r.index && s.h >= 0.0095;
  };
  const clearOf = (pts, rad) => {
    const c = Math.cos(rad);
    return !pts.some((p) => p.dot(d) > c);
  };
  let d;
  const visible = () => {
    const top = d.clone().multiplyScalar(1 + terrain.sample(d).h + LIFT + PX * 2);
    const p = new THREE.Vector3();
    for (let f = 0.15; f < 0.95; f += 0.1) {
      p.lerpVectors(eye, top, f);
      const len = p.length();
      if (len < 1 + Math.max(0, terrain.sample(p.divideScalar(len)).h)) return false;
    }
    return true;
  };

  const exhibits = stops.map((s) => s.exhibitDir);
  let found = null;
  let fallback = null;
  search: for (const dist of [0.042, 0.05, 0.035, 0.058]) {
    for (const deg of [140, -140, 125, -125, 155, -155, 110, -110, 165, -165, 100, -100]) {
      const a = THREE.MathUtils.degToRad(deg);
      d = at.clone().multiplyScalar(Math.cos(dist))
        .addScaledVector(fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)), Math.sin(dist))
        .normalize();
      if (!ok(d)) continue;
      fallback ??= d;
      if (clearOf(trail.path, 0.011) && clearOf(exhibits, 0.02) && visible()) {
        found = d;
        break search;
      }
    }
  }
  d = found ?? fallback ?? at;

  // stand it on the ground, facing the stop
  const obj = glyph(rows, r.index);
  const h = terrain.sample(d).h;
  const face = at.clone().sub(d);
  face.addScaledVector(d, -face.dot(d)).normalize();
  const x = new THREE.Vector3().crossVectors(d, face);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, d, face));
  const base = d.clone().multiplyScalar(1 + h);
  obj.position.copy(base);

  const phase = r.index * 1.3;
  const anim = (t) => {
    obj.position.copy(base).addScaledVector(d, Math.sin(t * 1.6 + phase) * 0.0006);
  };
  return { obj, dir: d, anim };
}
