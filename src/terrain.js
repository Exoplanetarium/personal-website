import * as THREE from 'three';
import { createNoise3D, fbm, mulberry32 } from './noise.js';
import { themes, wildTheme, water } from './themes.js';

const DETAIL = 56; // icosphere subdivision: higher = smaller facets
const PATCH_RES = 200; // grid cells across a ground-level island patch
export const BEACH = 0.0095; // heights below this (but above sea) are sand

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Terrain shapes. t: 0 at the coast → 1 inland (follows the wobbly coastline).
// c: 0 → 1 toward the exact island center (round, for central peaks).
// d: fine detail noise (-1..1), r: ridge noise (0..1).
const STYLES = {
  hills: {
    maxH: 0.1,
    height: (t, d, r, c) => 0.007 + t * 0.026 + c * c * 0.03 + d * 0.012 * t + r * r * 0.04 * t * c,
  },
  terraces: {
    maxH: 0.084,
    height: (t, d) => {
      const raw = t * 0.08 + d * 0.01 * t;
      return 0.007 + Math.max(0, Math.floor(raw / 0.014)) * 0.014;
    },
  },
  mesas: {
    maxH: 0.095,
    height: (t, d) =>
      0.007 + smoothstep(0.15, 0.28, t) * 0.035 + smoothstep(0.55, 0.64, t) * 0.045 + d * 0.004,
  },
  peaks: {
    maxH: 0.2,
    height: (t, d, r, c) => 0.007 + t * 0.028 + Math.pow(c, 2.2) * 0.16 + d * 0.012 * t + r * 0.018 * t * c,
  },
  wild: {
    maxH: 0.04,
    height: (t, d) => 0.006 + t * 0.022 + d * 0.006,
  },
};

export function latLonToDir(lat, lon) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}

/** Two unit vectors spanning the tangent plane at `dir`. */
export function tangentBasis(dir) {
  const ref = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(dir, ref).normalize();
  const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize();
  return [t1, t2];
}

/** Point on the sphere `angle` radians from `center`, heading along `bearing` in its tangent plane. */
export function offsetDir(center, [t1, t2], bearing, angle) {
  const tangent = t1.clone().multiplyScalar(Math.cos(bearing)).addScaledVector(t2, Math.sin(bearing));
  return center.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent, Math.sin(angle)).normalize();
}

function paletteColors(p) {
  return {
    sand: new THREE.Color(p.sand),
    bands: p.bands.map((c) => new THREE.Color(c)),
    cliff: new THREE.Color(p.cliff),
  };
}

export class Terrain {
  constructor(sections, seed = 7) {
    this.noiseA = createNoise3D(seed);
    this.noiseB = createNoise3D(seed * 31 + 5);
    this.regions = sections.map((s, index) => {
      const theme = themes[s.theme] ?? themes.village;
      return {
        index,
        center: latLonToDir(s.lat, s.lon),
        size: s.size ?? 0.45,
        style: theme.style,
        kit: theme.kit,
        palette: theme.palette,
        colors: paletteColors(theme.palette),
      };
    });
    this.wild = { style: 'wild', palette: wildTheme.palette, colors: paletteColors(wildTheme.palette) };
    this.hoverUniform = { value: -1 };
    this.timeUniform = { value: 0 };
    // xyz: center of the area the globe mesh should hide (a detail patch is drawn there), w: cos(radius)
    this.capUniform = { value: new THREE.Vector4(0, 1, 0, 2) };
  }

  /** Height + owning island for a unit direction. owner = region index, or -1 for wild/ocean. */
  sample(p) {
    const { x, y, z } = p;
    const nA = this.noiseA, nB = this.noiseB;
    const warp = fbm(nA, x * 2.2 + 1.7, y * 2.2, z * 2.2, 3);
    const detail = fbm(nB, x * 9, y * 9, z * 9, 3);
    const ridge = 1 - Math.abs(nA(x * 5 + 11, y * 5, z * 5));

    // Normalized "landness" score per island: >0 is land, ~1 near the center.
    let best = -Infinity, owner = -1, core = 0;
    for (const r of this.regions) {
      const c = r.center;
      const d = Math.acos(clamp(x * c.x + y * c.y + z * c.z, -1, 1));
      const s = (r.size - d + warp * r.size * 0.8) / r.size;
      if (s > best) { best = s; owner = r.index; core = clamp(1 - d / r.size, 0, 1); }
    }
    const islet = (fbm(nB, x * 3.4 - 4, y * 3.4, z * 3.4, 3) - 0.3) * 6;
    if (islet > best) { best = islet; owner = -1; core = 0; }

    if (best <= 0) {
      return { h: -0.007 + Math.max(best, -1.4) * 0.035 + detail * 0.004, owner: -1, land: false };
    }
    const style = owner >= 0 ? this.regions[owner].style : 'wild';
    const t = clamp(best / 0.7, 0, 1);
    return { h: STYLES[style].height(t, detail, ridge, core), owner, land: true };
  }

  /**
   * Turn a non-indexed triangle soup (positions already displaced, per-vertex heights)
   * into a colored geometry. Returns the geometry and each face's island index (-1 = none).
   */
  _colorize(positions, heights, seed) {
    const n = heights.length;
    const colors = new Float32Array(n * 3);
    const regionAttr = new Float32Array(n);
    const faceRegion = new Int16Array(n / 3);
    const rand = mulberry32(seed);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const center = new THREE.Vector3(), normal = new THREE.Vector3(), tmp = new THREE.Vector3();
    const col = new THREE.Color();
    const shallow = new THREE.Color(water.shallow), deep = new THREE.Color(water.deep);

    for (let f = 0; f < n / 3; f++) {
      const i = f * 3;
      a.fromArray(positions, i * 3);
      b.fromArray(positions, i * 3 + 3);
      c.fromArray(positions, i * 3 + 6);
      center.copy(a).add(b).add(c).normalize();
      normal.subVectors(c, b).cross(tmp.subVectors(a, b)).normalize();
      const slope = Math.abs(normal.dot(center));
      const h = (heights[i] + heights[i + 1] + heights[i + 2]) / 3;
      const s = this.sample(center);

      let region = -1;
      if (h < 0) {
        col.copy(shallow).lerp(deep, clamp(-h / 0.05, 0, 1));
      } else {
        const r = s.owner >= 0 ? this.regions[s.owner] : this.wild;
        region = s.land && s.owner >= 0 ? s.owner : -1;
        if (h < BEACH) {
          col.copy(r.colors.sand);
        } else {
          const bands = r.colors.bands;
          const frac = clamp((h - BEACH) / (STYLES[r.style].maxH - BEACH), 0, 0.999);
          col.copy(bands[Math.floor(frac * bands.length)]);
        }
        if (slope < 0.86) col.lerp(r.colors.cliff, 0.6 * smoothstep(0.86, 0.6, slope));
      }
      // per-facet jitter gives the hand-made, textured look
      col.offsetHSL((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06);

      faceRegion[f] = region;
      for (let k = 0; k < 3; k++) {
        colors[(i + k) * 3] = col.r;
        colors[(i + k) * 3 + 1] = col.g;
        colors[(i + k) * 3 + 2] = col.b;
        regionAttr[i + k] = region;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aRegion', new THREE.BufferAttribute(regionAttr, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return { geo, faceRegion };
  }

  buildMesh() {
    const ico = new THREE.IcosahedronGeometry(1, DETAIL);
    const positions = ico.attributes.position.array;
    const n = positions.length / 3;
    const v = new THREE.Vector3();
    const heights = new Float32Array(n);
    const cache = new Map();

    for (let i = 0; i < n; i++) {
      v.fromArray(positions, i * 3).normalize();
      const key = `${Math.round(v.x * 1e5)},${Math.round(v.y * 1e5)},${Math.round(v.z * 1e5)}`;
      let h = cache.get(key);
      if (h === undefined) {
        h = this.sample(v).h;
        cache.set(key, h);
      }
      heights[i] = h;
      v.multiplyScalar(1 + h).toArray(positions, i * 3);
    }

    const { geo, faceRegion } = this._colorize(positions, heights, 99);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.92,
      metalness: 0,
    });
    // Brighten the hovered island with a gentle pulse, and cut a hole where a detail patch is shown.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHover = this.hoverUniform;
      shader.uniforms.uTime = this.timeUniform;
      shader.uniforms.uCap = this.capUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRegion;\nvarying float vRegion;\nvarying vec3 vDir;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;\nvDir = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uHover;\nuniform float uTime;\nuniform vec4 uCap;\nvarying float vRegion;\nvarying vec3 vDir;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          if (dot(normalize(vDir), uCap.xyz) > uCap.w) discard;
          if (uHover > -0.5 && abs(vRegion - uHover) < 0.5) {
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.9), 0.16 + 0.07 * sin(uTime * 4.0));
          }`,
        );
    };

    const mesh = new THREE.Mesh(geo, material);
    return { mesh, faceRegion };
  }

  /** Radius (radians) of the high-detail patch for an island, and of the hole cut in the globe. */
  patchRadius(region) {
    return region.size * 1.5;
  }

  /** Hide the globe mesh where `region`'s detail patch is drawn (null to show everything). */
  setCap(region) {
    if (!region) {
      this.capUniform.value.set(0, 1, 0, 2);
      return;
    }
    const c = region.center;
    this.capUniform.value.set(c.x, c.y, c.z, Math.cos(this.patchRadius(region) * 0.97));
  }

  /** A finely tessellated round patch of terrain around an island, for ground-level views. */
  buildPatch(region) {
    const R = this.patchRadius(region);
    const N = PATCH_RES;
    const basis = tangentBasis(region.center);
    const [t1, t2] = basis;
    const c = region.center;

    // grid of directions via the exponential map around the island center
    const gridDir = new Float32Array((N + 1) * (N + 1) * 3);
    const gridH = new Float32Array((N + 1) * (N + 1));
    const inside = new Uint8Array((N + 1) * (N + 1));
    const v = new THREE.Vector3();
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const k = j * (N + 1) + i;
        const u = (i / N) * 2 - 1, w = (j / N) * 2 - 1;
        const r = Math.hypot(u, w) * R;
        if (r > R * 1.03) continue;
        inside[k] = 1;
        if (r < 1e-9) v.copy(c);
        else {
          const s = Math.sin(r) / (r / R);
          v.copy(c).multiplyScalar(Math.cos(r)).addScaledVector(t1, u * s).addScaledVector(t2, w * s).normalize();
        }
        gridH[k] = this.sample(v).h;
        v.toArray(gridDir, k * 3);
      }
    }

    const positions = [];
    const heights = [];
    const push = (k) => {
      const h = gridH[k];
      positions.push(gridDir[k * 3] * (1 + h), gridDir[k * 3 + 1] * (1 + h), gridDir[k * 3 + 2] * (1 + h));
      heights.push(h);
    };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1;
        if (!(inside[a] && inside[b] && inside[d] && inside[e])) continue;
        // alternate the diagonal so facets read as triangles, not a square grid
        if ((i + j) % 2) {
          push(a); push(d); push(b);
          push(b); push(d); push(e);
        } else {
          push(a); push(d); push(e);
          push(a); push(e); push(b);
        }
      }
    }

    const { geo } = this._colorize(new Float32Array(positions), new Float32Array(heights), 1234 + region.index);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }),
    );
    mesh.visible = false;
    return mesh;
  }

  buildOcean() {
    const geo = new THREE.IcosahedronGeometry(1, 30);
    const pos = geo.attributes.position;
    const base = pos.array.slice();
    const phase = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      phase[i] = this.noiseA(x * 4 + 30, y * 4, z * 4) * 9;
    }
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: water.ocean,
        flatShading: true,
        transparent: true,
        opacity: 0.78,
        roughness: 0.25,
        metalness: 0.05,
      }),
    );
    const arr = pos.array;
    return {
      mesh,
      update(t) {
        for (let i = 0; i < phase.length; i++) {
          const s = 1 + Math.sin(t * 1.3 + phase[i]) * 0.0025;
          arr[i * 3] = base[i * 3] * s;
          arr[i * 3 + 1] = base[i * 3 + 1] * s;
          arr[i * 3 + 2] = base[i * 3 + 2] * s;
        }
        pos.needsUpdate = true;
      },
    };
  }
}
