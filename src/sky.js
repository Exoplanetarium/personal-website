import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const TAU = Math.PI * 2;

function atmosphere() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.22, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#8fd8ff') } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec3 vNormal;
        void main() {
          float i = pow(max(0.0, 0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
          gl_FragColor = vec4(uColor, 1.0) * i * 0.55;
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
}

function stars(rand) {
  const N = 1800;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const tints = ['#ffffff', '#ffd6f0', '#c9e7ff', '#fff2b3', '#d6c9ff'].map((c) => new THREE.Color(c));
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(30 + rand() * 30);
    v.toArray(positions, i * 3);
    const c = tints[Math.floor(rand() * tints.length)].clone().multiplyScalar(0.4 + rand() * 0.6);
    c.toArray(colors, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false }),
  );
}

function cloud(rand, material) {
  const g = new THREE.Group();
  const puffs = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < puffs; i++) {
    const r = 0.022 + rand() * 0.022;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), material);
    m.position.set((i - puffs / 2) * 0.026 + rand() * 0.01, rand() * 0.008, (rand() - 0.5) * 0.02);
    m.scale.y = 0.7;
    m.rotation.set(rand() * TAU, rand() * TAU, 0);
    g.add(m);
  }
  return g;
}

function moon() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.09, 1),
    new THREE.MeshStandardMaterial({ color: '#efe6ff', flatShading: true, roughness: 1, fog: false }),
  );
  g.add(body);
  const crater = new THREE.MeshStandardMaterial({ color: '#b9a8e0', flatShading: true, roughness: 1, fog: false });
  [[0.06, 0.05, 0.05, 0.025], [-0.07, 0.02, 0.05, 0.02], [0.0, -0.06, 0.07, 0.018]].forEach(([x, y, z, r]) => {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), crater);
    c.position.set(x, y, z);
    g.add(c);
  });
  return g;
}

function ringedPlanet() {
  const g = new THREE.Group();
  g.userData.radius = 1.1;
  g.add(new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 1),
    new THREE.MeshStandardMaterial({ color: '#ff8a5c', flatShading: true, roughness: 0.9, fog: false }),
  ));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 2.3, 7, 1),
    new THREE.MeshStandardMaterial({ color: '#ffd29a', flatShading: true, side: THREE.DoubleSide, roughness: 0.9, fog: false }),
  );
  ring.rotation.x = Math.PI / 2.4;
  g.add(ring);
  return g;
}

export function buildSky(scene) {
  const rand = mulberry32(2024);

  scene.add(stars(rand));
  const atmo = atmosphere();
  scene.add(atmo);

  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
  const pivots = [];
  for (let i = 0; i < 16; i++) {
    const pivot = new THREE.Group();
    pivot.quaternion.setFromEuler(new THREE.Euler(rand() * TAU, rand() * TAU, rand() * TAU));
    const c = cloud(rand, cloudMat);
    c.position.set(0, 1.21 + rand() * 0.06, 0);
    pivot.add(c);
    pivot.userData.speed = 0.02 + rand() * 0.03;
    scene.add(pivot);
    pivots.push(pivot);
  }

  const moonPivot = new THREE.Group();
  moonPivot.rotation.z = 0.4;
  const m = moon();
  m.position.set(2.2, 0, 0);
  moonPivot.add(m);
  scene.add(moonPivot);

  const planet = ringedPlanet();
  planet.position.set(-14, 6, -22);
  scene.add(planet);

  return {
    /** The ringed planet in the distance (its first child is the body; set userData.frozen to stop the spin). */
    planet,
    /** 0 = orbit view, 1 = standing on the ground (the glow shell would surround the camera). */
    setGroundLevel(k) {
      atmo.visible = k < 0.5;
    },
    update(t, dt) {
      for (const p of pivots) p.rotateX(p.userData.speed * dt);
      moonPivot.rotation.y = t * 0.06;
      m.rotation.y = t * 0.2;
      if (!planet.userData.frozen) planet.rotation.y += dt * 0.03;
    },
  };
}
