import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { offsetDir, tangentBasis } from './terrain.js';

const TAU = Math.PI * 2;
export const PATH_STEP = 0.004; // spacing of trail points (radians)

// How far from the island center the last stop stands, so you can see the landmark.
const LANDMARK_VIEW = { village: 0.14, music: 0.135, code: 0.13, summit: 0.085 };
// Keep the trail from cutting through the landmark itself.
const LANDMARK_CLEAR = { village: 0.075, music: 0.075, code: 0.06, summit: 0.035 };

// Sideways detours a leg may take to find gentler ground (radians, either side of the straight line).
const DETOUR_STEP = 0.006;
const DETOUR_STATES = 13; // -0.036 … +0.036

/**
 * Lay out a walking trail on an island: a welcome stop near the beach, one stop per content
 * item spiralling inward (and uphill), and a final stop looking at the landmark.
 *
 * Returns {
 *   path:  Vector3[] unit directions, PATH_STEP apart
 *   eyeH:  ground height to walk at for each path point (smoothed, never below the terrain)
 *   stops: [{ kind, item, pathIdx, dir, exhibitDir, look }]
 * }
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
  /** How steep the ground is at `d` (height change per radian). */
  const slope = (d) => {
    const [a, b] = tangentBasis(d);
    const e = 0.006;
    const at = (v, s) => sampleH(d.clone().addScaledVector(v, s).normalize());
    return Math.hypot(at(a, e) - at(a, -e), at(b, e) - at(b, -e)) / (2 * e);
  };
  const isFlat = (d) => slope(d) < 0.5;
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

  // ── stops: spiral inward from the beach ──
  const stopDirs = [];
  for (let k = 0; k < n - 1; k++) {
    const bearing = b0 + k * turn;
    const coast = coastAt(bearing);
    const f = k === 0 ? 1 : THREE.MathUtils.lerp(0.78, 0.4, (k - 1) / Math.max(1, n - 3));
    const ang = Math.max(view + 0.07, k === 0 ? coast - 0.05 : coast * f);
    stopDirs.push(settle(offsetDir(center, basis, bearing, ang)));
  }
  // the last leg heads straight in, so you arrive already facing the landmark
  const lastBearing = b0 + (n - 2) * turn + 0.2;
  stopDirs.push(settle(offsetDir(center, basis, lastBearing, view), false));

  // ── path: each leg detours sideways around steep ground ──
  const path = [];
  const stopIdx = [];
  for (let k = 0; k < n - 1; k++) {
    stopIdx.push(path.length);
    path.push(...routeLeg(stopDirs[k], stopDirs[k + 1]));
  }
  stopIdx.push(path.length);
  path.push(stopDirs[n - 1].clone());

  /**
   * Cheapest route from A to B, where each point may shift sideways from the straight line.
   * Dynamic programming over (point, sideways offset): steep, wet, or landmark-blocked ground
   * costs a lot, and changing the offset costs a little so the route stays smooth.
   */
  function routeLeg(A, B) {
    const normal = new THREE.Vector3().crossVectors(A, B).normalize();
    const angle = A.angleTo(B);
    const steps = Math.max(2, Math.ceil(angle / PATH_STEP));
    const q = new THREE.Quaternion();
    const base = [];
    for (let j = 0; j <= steps; j++) base.push(A.clone().applyQuaternion(q.setFromAxisAngle(normal, (angle * j) / steps)));
    const mid = (DETOUR_STATES - 1) / 2;
    const at = (j, s) => base[j].clone().addScaledVector(normal, (s - mid) * DETOUR_STEP).normalize();
    const pointCost = (p) => {
      if (!isLand(p, 0.004)) return 40;
      if (p.angleTo(center) < clear) return 40;
      return slope(p) * 4;
    };

    const cost = [new Float64Array(DETOUR_STATES).fill(Infinity)];
    const back = [new Int8Array(DETOUR_STATES)];
    cost[0][mid] = 0;
    for (let j = 1; j <= steps; j++) {
      const c = new Float64Array(DETOUR_STATES).fill(Infinity);
      const bk = new Int8Array(DETOUR_STATES);
      for (let s = 0; s < DETOUR_STATES; s++) {
        let best = Infinity, from = s;
        for (let ds = -1; ds <= 1; ds++) {
          const prev = cost[j - 1][s + ds];
          if (prev === undefined) continue;
          const v = prev + Math.abs(ds) * 0.05;
          if (v < best) { best = v; from = s + ds; }
        }
        if (best === Infinity) continue;
        c[s] = best + pointCost(at(j, s)) + Math.abs(s - mid) * DETOUR_STEP * 2;
        bk[s] = from;
      }
      cost.push(c);
      back.push(bk);
    }

    // walk back from B (which must be on the straight line) to recover the offsets
    const offsets = new Float64Array(steps + 1);
    let s = mid;
    for (let j = steps; j >= 0; j--) {
      offsets[j] = (s - mid) * DETOUR_STEP;
      s = back[j][s];
    }
    // soften the corners, keeping both ends pinned to the stops
    for (let pass = 0; pass < 3; pass++) {
      const prev = offsets.slice();
      for (let j = 1; j < steps; j++) {
        let sum = 0, cnt = 0;
        for (let w = -4; w <= 4; w++) {
          const v = prev[j + w];
          if (v !== undefined) { sum += v; cnt++; }
        }
        offsets[j] = (sum / cnt) * Math.min(1, j / 4, (steps - j) / 4);
      }
    }

    const leg = [];
    for (let j = 0; j < steps; j++) {
      const p = base[j].clone().addScaledVector(normal, offsets[j]).normalize();
      // last-resort safety nets
      for (let tries = 0; tries < 12 && !isLand(p, 0.004); tries++) p.lerp(center, 0.12).normalize();
      if (p.angleTo(center) < clear) {
        const t = new THREE.Vector3().subVectors(p, center.clone().multiplyScalar(p.dot(center))).normalize();
        if (t.lengthSq() > 0) p.copy(center).multiplyScalar(Math.cos(clear)).addScaledVector(t, Math.sin(clear)).normalize();
      }
      leg.push(p);
    }
    return leg;
  }

  // ── a smooth height to walk at: the terrain's upper envelope, blurred ──
  // Taking the max over a window first means the blur can never dip the camera below a step.
  const raw = path.map((p) => Math.max(0, sampleH(p)));
  const ENV = 8, BLUR = 10, SIGMA = 4;
  const env = raw.map((_, i) => {
    let m = 0;
    for (let w = -ENV; w <= ENV; w++) m = Math.max(m, raw[i + w] ?? 0);
    return m;
  });
  const eyeH = env.map((_, i) => {
    let sum = 0, wsum = 0;
    for (let w = -BLUR; w <= BLUR; w++) {
      const v = env[i + w];
      if (v === undefined) continue;
      const g = Math.exp(-(w * w) / (2 * SIGMA * SIGMA));
      sum += v * g;
      wsum += g;
    }
    return Math.max(sum / wsum, raw[i]) + 0.002;
  });

  // ── what you look at from each stop ──
  const up = (d, lift) => d.clone().multiplyScalar(1 + Math.max(0, sampleH(d)) + lift);
  const tangentTo = (from, to, at) => {
    const v = new THREE.Vector3().subVectors(to, from);
    return v.addScaledVector(at, -v.dot(at)).normalize();
  };
  const clearOfPath = (d, r) => {
    const c = Math.cos(r);
    return !path.some((p) => p.dot(d) > c);
  };

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

    // Put the exhibit roughly where you're already heading, leaning toward the next leg, so
    // arriving needs only a small turn and the way onward is just beside it.
    const inDir = tangentTo(path[Math.max(0, pathIdx - 6)], dir, dir);
    const outDir = tangentTo(dir, path[Math.min(path.length - 1, pathIdx + 6)], dir);
    let bis = inDir.clone().add(outDir);
    if (bis.lengthSq() < 0.01) bis = outDir.clone();
    bis.normalize();
    // side away from the inside of the bend (or alternate sides on a straight)
    const bend = outDir.clone().sub(inDir);
    bend.addScaledVector(bis, -bend.dot(bis));
    const outside = bend.length() > 0.35
      ? bend.normalize().negate()
      : new THREE.Vector3().crossVectors(dir, bis).multiplyScalar(k % 2 ? 1 : -1);
    const candidates = [
      [0.042, 0.026], [0.042, -0.026], [0.03, 0.04], [0.03, -0.04], [0.0, 0.045], [0.0, -0.045],
    ].map(([f, s]) => dir.clone().addScaledVector(bis, f).addScaledVector(outside, s).normalize());
    const exhibitDir =
      candidates.find((d) => isLand(d) && clearOfPath(d, 0.02) && isFlat(d)) ??
      candidates.find((d) => isLand(d) && clearOfPath(d, 0.016)) ??
      candidates[0];
    return { kind, item: k - 1, pathIdx, dir, exhibitDir, look: up(exhibitDir, 0.014) };
  });

  return { path, eyeH, stops };
}

/** True if `dir` is within `radius` radians of the trail or any of its exhibits. */
export function nearTrail(trail, dir, radius = 0.016) {
  const c = Math.cos(radius);
  for (const p of trail.path) if (p.dot(dir) > c) return true;
  const ce = Math.cos(radius + 0.012);
  for (const s of trail.stops) if (s.exhibitDir.dot(dir) > ce) return true;
  return false;
}
