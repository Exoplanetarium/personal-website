import * as THREE from 'three';
import './secret.css';

// The hideout on the ringed planet. Only loaded when someone types the secret word into the URL,
// so none of this costs anything on a normal visit.
//
// Sequence: pivot to face the planet → zoom across and swoop down onto its surface → look around
// → "Back home" flies you back to the globe.

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const EYE = 0.1; // eye height above the planet's surface
const STAND_OFF = 0.5; // how far back from the sign you land (radians around the planet)
const FOV = 55;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const _m = new THREE.Matrix4();
const lookQuat = (eye, target, up, out = new THREE.Quaternion()) => out.setFromRotationMatrix(_m.lookAt(eye, target, up));

function bezier(P, k, out = new THREE.Vector3()) {
  const u = 1 - k;
  return out
    .copy(P[0]).multiplyScalar(u * u * u)
    .addScaledVector(P[1], 3 * u * u * k)
    .addScaledVector(P[2], 3 * u * k * k)
    .addScaledVector(P[3], k * k * k);
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const g = c.getContext('2d');
    g.fillStyle = '#fffaf2';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#1d1430';
    g.lineWidth = 14;
    g.strokeRect(28, 28, c.width - 56, c.height - 56);
    g.fillStyle = '#1d1430';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 132px "Space Grotesk", system-ui, sans-serif';
    g.fillText('you found me!', c.width / 2, c.height / 2 + 6);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load('700 132px "Space Grotesk"').then(draw, () => {});
  return tex;
}

function signpost() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a3b', flatShading: true, roughness: 0.9 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const W = 0.34, H = 0.17, BOARD_Y = 0.2;
  for (const x of [-W * 0.36, W * 0.36]) {
    const post = new THREE.Mesh(box, wood);
    post.scale.set(0.018, BOARD_Y + 0.05, 0.018);
    post.position.set(x, (BOARD_Y + 0.05) / 2 - 0.05, -0.017); // sunk a little into the ground
    g.add(post);
  }
  const board = new THREE.Mesh(box, wood);
  board.scale.set(W + 0.02, H + 0.02, 0.016);
  board.position.y = BOARD_Y;
  g.add(board);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.95 }));
  face.position.set(0, BOARD_Y, 0.0085);
  g.add(face);
  return { group: g, boardY: BOARD_Y };
}

export function createHideout({ scene, camera, canvas, planet, reduceMotion, homePosition, onHome }) {
  const body = planet.children[0];
  const C = planet.getWorldPosition(new THREE.Vector3());
  const R = planet.userData.radius ?? 1.1;

  // Put the hideout on the side facing home, high enough that the globe hangs in the sky above the sign.
  const toHome = ORIGIN.clone().sub(C).normalize();
  const perp = Y.clone().addScaledVector(toHome, -Y.dot(toHome)).normalize();
  const upA = toHome.clone().multiplyScalar(Math.cos(Math.PI / 4)).addScaledVector(perp, Math.sin(Math.PI / 4)).normalize();

  // Hold the planet still (so the ground under you stays put), turned so its tilted ring dips
  // away on this side instead of cutting across the view. The planet is off-screen when this runs.
  planet.userData.frozen = true;
  planet.rotation.y = Math.atan2(-upA.x, -upA.z);
  planet.updateMatrixWorld(true);
  const front = toHome.clone().addScaledVector(upA, -toHome.dot(upA)).normalize(); // along the ground, toward home
  const right = new THREE.Vector3().crossVectors(front, upA);

  const ray = new THREE.Raycaster();
  /** Distance from the planet's center to its (faceted) surface along `dir`. */
  const surface = (dir) => {
    ray.set(C.clone().addScaledVector(dir, R * 3), dir.clone().negate());
    const hit = ray.intersectObject(body, false)[0];
    return hit ? hit.point.distanceTo(C) : R;
  };

  const group = new THREE.Group();
  const sign = signpost();
  sign.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upA, front.clone().negate()));
  sign.group.position.copy(C).addScaledVector(upA, surface(upA));
  group.add(sign.group);
  scene.add(group);

  const signLook = sign.group.position.clone().addScaledVector(upA, sign.boardY);
  const eyeDir = upA.clone().applyAxisAngle(right, STAND_OFF); // back from the sign, away from home
  const eye = C.clone().addScaledVector(eyeDir, surface(eyeDir) + EYE);
  const landQ = lookQuat(eye, signLook, upA);
  // swing in over the sign and settle back down facing it
  const swing = eye.clone().addScaledVector(front, -1.2).addScaledVector(eyeDir, 0.9);

  // ── overlay ───────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.className = 'hideout';
  ui.innerHTML = `
    <button class="hideout-back"><span aria-hidden="true">←</span> Back home</button>
    <p class="hideout-hint">Drag to look around</p>`;
  document.body.append(ui);
  document.body.classList.add('in-hideout');
  ui.querySelector('.hideout-back').addEventListener('click', () => leave());

  // ── state ─────────────────────────────────────────────────
  const st = { phase: 'pivot', t0: null, yaw: 0, pitch: 0 };
  const P0 = camera.position.clone();
  const Q0 = camera.quaternion.clone();
  const fov0 = camera.fov;
  const faceQ = lookQuat(P0, C, Y);
  const inPath = [P0, P0.clone().lerp(C, 0.55), swing, eye];
  let outPath = null;
  let leaveQ = null;
  const dur = (s) => (reduceMotion ? 0.01 : s);
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  const up = new THREE.Vector3();
  const q = new THREE.Quaternion();

  function setFov(f) {
    camera.fov = f;
    camera.updateProjectionMatrix();
  }

  function go(phase, t) {
    st.phase = phase;
    st.t0 = t;
  }

  function leave() {
    if (st.phase !== 'here') return;
    ui.classList.remove('open');
    leaveQ = camera.quaternion.clone();
    outPath = [camera.position.clone(), swing, homePosition.clone().lerp(C, 0.55), homePosition.clone()];
    st.phase = 'out';
    st.t0 = null;
  }

  // ── drag to look around once you've landed ────────────────
  let drag = null;
  const onDown = (e) => {
    if (st.phase !== 'here') return;
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    st.yaw += (e.clientX - drag.x) * 0.005;
    st.pitch = clamp(st.pitch + (e.clientY - drag.y) * 0.004, -1.1, 1.1);
    drag.x = e.clientX;
    drag.y = e.clientY;
    ui.classList.add('has-dragged');
  };
  const onUp = () => (drag = null);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  function dispose() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    scene.remove(group);
    group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.map?.dispose();
      o.material?.dispose();
    });
    ui.remove();
    document.body.classList.remove('in-hideout');
    planet.userData.frozen = false;
  }

  function update(t) {
    if (st.t0 === null) st.t0 = t;
    const el = t - st.t0;

    if (st.phase === 'pivot') {
      // turn from the globe to the planet, then a beat to take it in
      const k = clamp(el / dur(2), 0, 1);
      camera.quaternion.copy(Q0).slerp(faceQ, ease(k));
      if (el >= dur(2.6)) go('in', t);
    } else if (st.phase === 'in') {
      const k = clamp(el / dur(5), 0, 1);
      const e = ease(k);
      bezier(inPath, e, pos);
      // keep the planet centered, then turn toward the sign on the way down
      const turn = smooth(0.55, 0.95, e);
      target.copy(C).lerp(signLook, turn);
      up.copy(Y).lerp(upA, turn).normalize();
      lookQuat(pos, target, up, q);
      if (k >= 0.97) q.slerp(landQ, smooth(0.97, 1, k));
      camera.position.copy(pos);
      camera.quaternion.copy(faceQ).slerp(q, smooth(0, 0.08, k));
      // a quick lens punch-in, then open up wide for the landing
      setFov(k < 0.3 ? lerp(fov0, 28, ease(k / 0.3)) : lerp(28, FOV, smooth(0.3, 1, k)));
      if (k >= 1) {
        go('here', t);
        ui.classList.add('open');
      }
    } else if (st.phase === 'here') {
      camera.position.copy(eye);
      q.setFromAxisAngle(upA, st.yaw).multiply(landQ);
      camera.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(X, st.pitch));
    } else if (st.phase === 'out') {
      const k = clamp(el / dur(4), 0, 1);
      const e = ease(k);
      bezier(outPath, e, pos);
      target.copy(signLook).lerp(ORIGIN, smooth(0, 0.35, e));
      up.copy(upA).lerp(Y, smooth(0.15, 0.7, e)).normalize();
      lookQuat(pos, target, up, q);
      camera.position.copy(pos);
      camera.quaternion.copy(leaveQ).slerp(q, smooth(0, 0.2, k));
      setFov(lerp(FOV, fov0, smooth(0.2, 1, k)));
      if (k >= 1) {
        camera.position.copy(homePosition);
        camera.lookAt(ORIGIN);
        setFov(fov0);
        dispose();
        onHome();
      }
    }
  }

  return { update, leave };
}
