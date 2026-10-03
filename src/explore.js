import * as THREE from 'three';
import { PATH_STEP } from './trails.js';

// "Street view": stand on an island and walk its trail from stop to stop.

const EYE = 0.013; // eye height above the ground
const WALK_SPEED = 0.1; // radians per second along the trail
const FOV_ORBIT = 40;
const FOV_GROUND = 62;
const NEAR_ORBIT = 0.05;
const NEAR_GROUND = 0.002;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeSine = (k) => 0.5 - Math.cos(Math.PI * k) / 2;

const ORIGIN = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

function lookQuat(eye, target, up, out = new THREE.Quaternion()) {
  return out.setFromRotationMatrix(_m.lookAt(eye, target, up));
}

function skyDome() {
  const uniforms = {
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uOpacity: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uUp;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform float uOpacity;
        varying vec3 vDir;
        void main() {
          float h = dot(normalize(vDir), uUp);
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.65, h));
          // thinner toward the zenith so a few stars peek through
          float a = mix(1.0, 0.55, smoothstep(0.25, 0.95, h)) * uOpacity;
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  mesh.renderOrder = 1; // after the ocean and stars
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { mesh, uniforms };
}

export function createExplorer({ canvas, camera, scene, terrain, trails, props, sky, ui, reduceMotion, orbitDistance, onEnter, onExit }) {
  const patches = new Map();
  const dome = skyDome();
  scene.add(dome.mesh);
  scene.fog = new THREE.Fog('#ffffff', 1000, 2000); // parked far away until we land

  const st = {
    active: false,
    region: -1,
    trail: null,
    tween: null,
    walk: null,
    pendingTravel: -1,
    s: 0, // position along the trail (path index, fractional)
    stop: 0,
    hSmooth: 0,
    lookDir: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    ground: 0, // 0 = orbit look, 1 = ground look (fog, sky, fov)
    time: 0,
    tagOpacity: [],
  };

  const v = {
    dir: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    target: new THREE.Vector3(),
    eye: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    right: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    p: new THREE.Vector3(),
  };

  function getPatch(i) {
    if (!patches.has(i)) {
      const mesh = terrain.buildPatch(terrain.regions[i]);
      scene.add(mesh);
      patches.set(i, mesh);
    }
    return patches.get(i);
  }

  function pathDir(s, out) {
    const P = st.trail.path;
    const i = clamp(Math.floor(s), 0, P.length - 2);
    const f = clamp(s - i, 0, 1);
    return out.copy(P[i]).lerp(P[i + 1], f).normalize();
  }

  /** Where the camera should be on the ground right now (writes v.eye / v.quat). */
  function groundPose(dt, snap) {
    const stops = st.trail.stops;
    const dir = pathDir(st.s, v.dir);
    const h = Math.max(0, terrain.sample(dir).h);
    st.hSmooth = snap ? h : st.hSmooth + (h - st.hSmooth) * Math.min(1, dt * 6);
    v.eye.copy(dir).multiplyScalar(1 + st.hSmooth + EYE);

    if (st.walk) {
      const w = st.walk;
      const sign = Math.sign(w.to - w.from) || 1;
      const ahead = pathDir(clamp(st.s + sign * 7, 0, st.trail.path.length - 1), v.ahead);
      v.target.copy(ahead).multiplyScalar(1 + Math.max(0, terrain.sample(ahead).h) + EYE * 0.8);
      // as you arrive, turn toward what you came to see
      v.target.lerp(stops[w.target].look, smooth(0.7, 1, w.k));
      // gentle footstep bob
      v.eye.addScaledVector(dir, Math.sin(st.s * 1.8) * 0.00035);
    } else {
      v.target.copy(stops[st.stop].look);
    }

    const desired = v.target.sub(v.eye).normalize();
    if (snap) st.lookDir.copy(desired);
    else st.lookDir.lerp(desired, 1 - Math.exp(-dt * 4)).normalize();

    v.right.crossVectors(st.lookDir, dir).normalize();
    v.fwd.copy(st.lookDir).applyAxisAngle(dir, st.yaw);
    v.right.applyAxisAngle(dir, st.yaw);
    v.fwd.applyAxisAngle(v.right, st.pitch);
    lookQuat(v.eye, v.p.copy(v.eye).add(v.fwd), dir, v.quat);
  }

  /** Heading along the ground (tangent part of the look direction). */
  function heading(dir, look) {
    return look.clone().addScaledVector(dir, -look.dot(dir)).normalize();
  }

  function applyGroundLook(g) {
    st.ground = g;
    camera.fov = lerp(FOV_ORBIT, FOV_GROUND, g);
    camera.near = lerp(NEAR_ORBIT, NEAR_GROUND, smooth(0, 0.3, g));
    camera.updateProjectionMatrix();
    scene.fog.near = lerp(50, 0.1, g);
    scene.fog.far = lerp(60, 0.75, g);
    dome.uniforms.uOpacity.value = g;
    dome.mesh.visible = g > 0.001;
    sky.setGroundLevel(g);
  }

  // ── enter / exit ──────────────────────────────────────────
  function enter(i) {
    if (st.active) {
      if (i !== st.region) travel(i);
      return;
    }
    const region = terrain.regions[i];
    st.active = true;
    st.region = i;
    st.trail = trails[i];
    st.walk = null;
    st.stop = 0;
    st.s = st.trail.stops[0].pathIdx;
    st.yaw = st.pitch = 0;
    st.tagOpacity = st.trail.stops.map(() => 0);

    getPatch(i).visible = true;
    terrain.setCap(region);
    dome.uniforms.uZenith.value.set(region.palette.sky.zenith);
    dome.uniforms.uHorizon.value.set(region.palette.sky.horizon);
    scene.fog.color.set(region.palette.sky.horizon);

    groundPose(0, true);
    const dir = st.trail.stops[0].dir.clone();
    st.tween = {
      kind: 'in',
      t0: st.time,
      dur: reduceMotion ? 0.01 : 3.2,
      P0: camera.position.clone(),
      Q0: camera.quaternion.clone(),
      P1: v.eye.clone(),
      Q1: v.quat.clone(),
      upA: WORLD_UP.clone(),
      upB: heading(dir, st.lookDir),
    };
    ui.explore.enter(i, st.trail.stops);
    onEnter(i);
  }

  function exit() {
    if (!st.active || st.tween?.kind === 'out') return;
    st.walk = null;
    ui.explore.hideCard();
    const dir = camera.position.clone().normalize();
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    st.tween = {
      kind: 'out',
      t0: st.time,
      dur: reduceMotion ? 0.01 : 2.2,
      P0: camera.position.clone(),
      Q0: camera.quaternion.clone(),
      P1: dir.clone().multiplyScalar(orbitDistance()),
      upA: heading(dir, look),
      upB: WORLD_UP.clone(),
    };
  }

  function travel(i) {
    st.pendingTravel = i;
    exit();
  }

  function finishExit() {
    st.active = false;
    st.tween = null;
    patches.get(st.region).visible = false;
    st.region = -1;
    terrain.setCap(null);
    applyGroundLook(0);
    camera.position.copy(st.tweenEnd);
    camera.lookAt(ORIGIN);
    ui.explore.exit();
    const next = st.pendingTravel;
    st.pendingTravel = -1;
    onExit(next);
    if (next >= 0) enter(next);
  }

  function updateTween(t) {
    const tw = st.tween;
    const k = clamp((t - tw.t0) / tw.dur, 0, 1);
    const dA = tw.P0.clone().normalize();
    const r0 = tw.P0.length(), r1 = tw.P1.length();
    let pos, q;

    if (tw.kind === 'in') {
      const dB = tw.P1.clone().normalize();
      const turn = new THREE.Quaternion().slerpQuaternions(
        new THREE.Quaternion(),
        new THREE.Quaternion().setFromUnitVectors(dA, dB),
        ease(Math.min(1, k / 0.8)),
      );
      const r = r1 + (r0 - r1) * (1 - smooth(0.2, 1, k));
      pos = dA.applyQuaternion(turn).multiplyScalar(r);
      const up = tw.upA.clone().lerp(tw.upB, smooth(0, 0.6, k)).normalize();
      const qCenter = lookQuat(pos, ORIGIN, up);
      q = tw.Q0.clone().slerp(qCenter, smooth(0, 0.15, k)).slerp(tw.Q1, smooth(0.6, 1, k));
      applyGroundLook(smooth(0.55, 1, k));
    } else {
      pos = dA.multiplyScalar(lerp(r0, r1, ease(k)));
      const up = tw.upA.clone().lerp(tw.upB, smooth(0.2, 1, k)).normalize();
      const qCenter = lookQuat(pos, ORIGIN, up);
      q = tw.Q0.clone().slerp(qCenter, smooth(0, 0.35, k));
      applyGroundLook(1 - smooth(0, 0.45, k));
    }

    camera.position.copy(pos);
    camera.quaternion.copy(q);

    if (k >= 1) {
      if (tw.kind === 'in') {
        st.tween = null;
        arrive(0);
      } else {
        st.tweenEnd = tw.P1;
        finishExit();
      }
    }
  }

  // ── walking ───────────────────────────────────────────────
  function walkTo(k) {
    if (!st.active || st.tween) return;
    const stops = st.trail.stops;
    k = clamp(k, 0, stops.length - 1);
    if (k === st.stop && !st.walk) return;
    const to = stops[k].pathIdx;
    const dist = Math.abs(to - st.s) * PATH_STEP;
    st.walk = {
      from: st.s,
      to,
      target: k,
      t0: st.time,
      k: 0,
      dur: reduceMotion ? 0.01 : clamp(dist / WALK_SPEED, 0.8, 7),
    };
    ui.explore.hideCard();
    ui.explore.setStop(k, true);
  }

  function arrive(k) {
    st.stop = k;
    st.walk = null;
    ui.explore.setStop(k, false);
    ui.explore.showCard(k);
  }

  function step(delta) {
    const base = st.walk ? st.walk.target : st.stop;
    walkTo(base + delta);
  }

  // ── input: drag to look, click a stop to walk there ──────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null;

  function pickStop(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(props.trails[st.region].hits, false)[0];
    return hit ? hit.object.userData.stop : -1;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!st.active || st.tween) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!st.active || st.tween) return;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
      st.yaw += dx * 0.005;
      st.pitch = clamp(st.pitch + dy * 0.004, -0.9, 0.9);
      ui.explore.dragged();
    } else if (e.pointerType === 'mouse') {
      canvas.classList.toggle('pointing', pickStop(e) >= 0);
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const click = drag.moved < 6 && performance.now() - drag.t < 500;
    drag = null;
    if (!click || !st.active) return;
    const k = pickStop(e);
    if (k >= 0) walkTo(k);
  });

  // ── floating labels for the other stops, and the card ─────
  const proj = new THREE.Vector3();
  function toScreen(p, w, h) {
    proj.copy(p).project(camera);
    const inFront = v.p.subVectors(p, camera.position).dot(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)) > 0;
    return { x: (proj.x * 0.5 + 0.5) * w, y: (-proj.y * 0.5 + 0.5) * h, inFront };
  }

  function occluded(from, to) {
    for (let f = 0.15; f < 0.95; f += 0.1) {
      v.p.lerpVectors(from, to, f);
      const r = v.p.length();
      if (r < 1 + Math.max(0, terrain.sample(v.p.divideScalar(r)).h)) return true;
    }
    return false;
  }

  function updateOverlays(dt, w, h) {
    const stops = st.trail.stops;
    const settled = !st.tween;
    stops.forEach((stop, k) => {
      const here = k === st.stop && !st.walk;
      const p = stop.look.clone().addScaledVector(stop.dir, 0.014);
      const dist = camera.position.distanceTo(p);
      const s = toScreen(p, w, h);
      let want = 0;
      if (settled && !here && s.inFront && dist < 0.4 && !occluded(camera.position, p)) want = 1 - smooth(0.22, 0.4, dist);
      st.tagOpacity[k] += (want - st.tagOpacity[k]) * Math.min(1, dt * 6);
      ui.explore.placeTag(k, s.x, s.y, st.tagOpacity[k]);
    });
    if (settled && !st.walk) {
      const s = toScreen(stops[st.stop].look, w, h);
      ui.explore.placeCard(s.x, s.y, s.inFront);
    }
  }

  // ── per frame ─────────────────────────────────────────────
  function update(t, dt, w, h) {
    st.time = t;
    if (!st.active) return;
    if (st.tween) {
      updateTween(t);
      if (!st.active) return;
    } else {
      if (st.walk) {
        const walk = st.walk;
        walk.k = clamp((t - walk.t0) / walk.dur, 0, 1);
        st.s = lerp(walk.from, walk.to, easeSine(walk.k));
        // drift your gaze back to straight ahead while walking
        st.yaw *= Math.exp(-dt * 2.5);
        st.pitch *= Math.exp(-dt * 2.5);
        if (walk.k >= 1) arrive(walk.target);
      }
      groundPose(dt, false);
      camera.position.copy(v.eye);
      camera.quaternion.copy(v.quat);
    }
    dome.mesh.position.copy(camera.position);
    dome.uniforms.uUp.value.copy(camera.position).normalize();
    updateOverlays(dt, w, h);
  }

  /** Build the detail patches in the background so landing later doesn't hitch. */
  function prebuild() {
    const queue = terrain.regions.map((r) => r.index);
    const next = () => {
      const i = queue.shift();
      if (i === undefined) return;
      if (!patches.has(i)) getPatch(i).visible = st.active && st.region === i;
      setTimeout(next, 400);
    };
    setTimeout(next, 400);
  }

  return {
    get active() {
      return st.active;
    },
    get busy() {
      return !!st.tween;
    },
    get region() {
      return st.region;
    },
    enter,
    exit,
    travel,
    step,
    walkTo,
    update,
    prebuild,
  };
}
