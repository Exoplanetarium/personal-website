import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { offsetDir, tangentBasis } from './terrain.js';

const TAU = Math.PI * 2;
export const PATH_STEP = 0.004; // spacing of trail points (radians)

// How far from the island center the last stop stands, so you can see the landmark.
const LANDMARK_VIEW = { village: 0.14, music: 0.135, code: 0.13, summit: 0.085 };
// Keep the trail from cutting through the landmark itself.
const LANDMARK_CLEAR = { village: 0.075, music: 0.075, code: 0.06, summit: 0.035 };

/**
 * Lay out a walking trail on an island: a welcome stop near the beach, one stop per content
 * item spiralling inward (and uphill), and a final stop looking at the landmark.
 *
 * Returns { path: Vector3[] (unit dirs), stops: [{ kind, item, pathIdx, dir, exhibitDir, look }] }
 */
export function planTrail(terrain, region, itemCount) {
  const { center, size, index } = region;
  const basis = tangentBasis(center);
  const rand = mulberry32(500 + index * 13);
  const sampleH = (d) => terrain.sample(d).h;
  const isLand = (d, min = 0.0095) => {
    const s = terrain.sample(d);
    return s.land && s.owner === index && s.h >= min;
  };
  const coastAt = (bearing) => {
    let a = 0.05;
    while (a < size * 2 && isLand(offsetDir(center, basis, bearing, a + 0.01))) a += 0.01;
    return a;
  };
  const isFlat = (d) => {
    const [a, b] = tangentBasis(d);
    const h = sampleH(d);
    return (
      Math.abs(sampleH(d.clone().addScaledVector(a, 0.008).normalize()) - h) < 0.006 &&
      Math.abs(sampleH(d.clone().addScaledVector(b, 0.008).normalize()) - h) < 0.006
    );
  };
  // nudge a spot onto nearby flat land
  const settle = (d, needFlat = true) => {
    if (isLand(d) && (!needFlat || isFlat(d))) return d;
    const local = tangentBasis(d);
    for (let r = 0.008; r <= 0.05; r += 0.008) {
      for (let k = 0; k < 10; k++) {
        const p = offsetDir(d, local, (k / 10) * TAU, r);
        if (isLand(p) && (!needFlat || isFlat(p))) return p;
      }
    }
    return d;
  };

  const view = LANDMARK_VIEW[region.kit] ?? 0.09;
  const clear = LANDMARK_CLEAR[region.kit] ?? 0.06;
  const n = itemCount + 2;
  const b0 = rand() * TAU;
  const turn = Math.min(1.25, (TAU * 0.8) / Math.max(1, n - 2));

  // ── stops ──
  const stopDirs = [];
  for (let k = 0; k < n; k++) {
    const bearing = b0 + k * turn;
    if (k === n - 1) {
      stopDirs.push(settle(offsetDir(center, basis, bearing, view), false));
      continue;
    }
    const coast = coastAt(bearing);
    const f = k === 0 ? 1 : THREE.MathUtils.lerp(0.78, 0.4, (k - 1) / Math.max(1, n - 3));
    const ang = Math.max(view + 0.07, k === 0 ? coast - 0.05 : coast * f);
    stopDirs.push(settle(offsetDir(center, basis, bearing, ang)));
  }

  // ── path between stops ──
  const path = [];
  const stopIdx = [];
  const q = new THREE.Quaternion();
  for (let k = 0; k < n - 1; k++) {
    const A = stopDirs[k], B = stopDirs[k + 1];
    const normal = new THREE.Vector3().crossVectors(A, B).normalize();
    const angle = A.angleTo(B);
    const steps = Math.max(2, Math.ceil(angle / PATH_STEP));
    const sway = (rand() - 0.5) * 0.06;
    const ph = rand() * TAU;
    stopIdx.push(path.length);
    for (let j = 0; j < steps; j++) {
      const f = j / steps;
      q.setFromAxisAngle(normal, angle * f);
      const p = A.clone().applyQuaternion(q);
      // meander sideways (zero at both ends)
      const off = Math.sin(f * Math.PI) * (sway + Math.sin(f * Math.PI * 3 + ph) * 0.008);
      p.addScaledVector(normal, off).normalize();
      // stay out of the sea: pull wet points toward the island center
      for (let tries = 0; tries < 12 && !isLand(p, 0.004); tries++) p.lerp(center, 0.12).normalize();
      // walk around the landmark, not through it
      const dc = p.angleTo(center);
      if (dc < clear) {
        const t = new THREE.Vector3().subVectors(p, center.clone().multiplyScalar(p.dot(center))).normalize();
        if (t.lengthSq() > 0) p.copy(center).multiplyScalar(Math.cos(clear)).addScaledVector(t, Math.sin(clear)).normalize();
      }
      path.push(p);
    }
  }
  stopIdx.push(path.length);
  path.push(stopDirs[n - 1].clone());

  // ── what you look at from each stop ──
  const up = (d, lift) => d.clone().multiplyScalar(1 + Math.max(0, sampleH(d)) + lift);
  const stops = stopDirs.map((dir, k) => {
    const pathIdx = stopIdx[k];
    const kind = k === 0 ? 'welcome' : k === n - 1 ? 'finale' : 'item';
    if (kind === 'finale') {
      return { kind, item: -1, pathIdx, dir, exhibitDir: center.clone(), look: up(center, 0.035) };
    }
    const ahead = path[Math.min(path.length - 1, pathIdx + 12)];
    if (kind === 'welcome') {
      return { kind, item: -1, pathIdx, dir, exhibitDir: ahead.clone(), look: up(ahead, 0.022) };
    }
    // exhibits stand beside the trail, alternating sides
    const fwd = new THREE.Vector3().subVectors(ahead, dir);
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize();
    const side = new THREE.Vector3().crossVectors(dir, fwd).multiplyScalar(k % 2 ? 1 : -1);
    let exhibitDir = dir.clone().addScaledVector(side, 0.04).addScaledVector(fwd, 0.018).normalize();
    if (!isLand(exhibitDir)) exhibitDir = dir.clone().addScaledVector(side, -0.04).addScaledVector(fwd, 0.018).normalize();
    if (!isLand(exhibitDir)) exhibitDir = dir.clone().addScaledVector(fwd, 0.044).normalize();
    return { kind, item: k - 1, pathIdx, dir, exhibitDir, look: up(exhibitDir, 0.014) };
  });

  return { path, stops };
}

/** True if `dir` is within `radius` radians of the trail or any of its exhibits. */
export function nearTrail(trail, dir, radius = 0.016) {
  const c = Math.cos(radius);
  for (const p of trail.path) if (p.dot(dir) > c) return true;
  const ce = Math.cos(radius + 0.012);
  for (const s of trail.stops) if (s.exhibitDir.dot(dir) > ce) return true;
  return false;
}
