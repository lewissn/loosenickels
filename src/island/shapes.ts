import {
  BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial,
  type MeshStandardMaterialParameters,
} from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { makeNoise, mulberry32, smooth, type Rand } from "./noise";
import { NOISE_GLSL, WIND_GLSL, type Shared } from "./shared";

/* Organic shapes for the trees and rocks, grown procedurally.

   Each shape carries baked shading in its vertex colours — darker
   underneath and inside a canopy, where light would not reach — which the
   per-tree tint multiplies. Several variants of each are grown, so
   neighbours differ by more than a turn and a scale. */

const bump = makeNoise(4242);

/** A smooth sphere, lumpy with noise, as an indexed geometry. */
function lump(radius: number, detail: number, roughness: number, salt: number) {
  const g = new IcosahedronGeometry(radius, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const m = mergeVertices(g);
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), len = Math.hypot(x, y, z) || 1;
    const n = bump(x * 1.3 + z * 0.7 + salt, y * 1.3 - z * 0.5 - salt) * 0.65 + bump(x * 3.1 - salt, z * 3.1 + y) * 0.35;
    const k = 1 + n * roughness;
    p.setXYZ(i, (x / len) * radius * k, (y / len) * radius * k, (z / len) * radius * k);
  }
  m.computeVertexNormals();
  return m;
}

/** Writes a vertex colour from a function of position. */
function shade(g: BufferGeometry, f: (x: number, y: number, z: number) => number) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = f(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute("color", new BufferAttribute(c, 3));
  return g;
}

/** A broadleaf canopy: a cluster of lumps, centred near the origin. */
export function canopy(seed: number, detail: number): BufferGeometry {
  const r = mulberry32(seed);
  const parts: BufferGeometry[] = [];
  const blobs = 6 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.7 + r() * 0.7;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = (i === 0 ? 0.3 : (r() - 0.35) * 1.1);
    const rad = i === 0 ? 1.35 : 0.85 + r() * 0.5;
    const blob = lump(rad, detail, 0.22, seed * 3.1 + i * 7.7).translate(cx, cy, cz);
    // Each lump a touch lighter or darker than its neighbours.
    const tone = 0.86 + r() * 0.24;
    shade(blob, (x, y, z) => {
      const inner = Math.hypot(x, z) / 2.2;
      return tone * (0.5 + 0.5 * smooth(-1.3, 1.6, y)) * (0.8 + 0.2 * Math.min(1, inner));
    });
    parts.push(blob);
  }
  return mergeGeometries(parts).scale(1.15, 0.95, 1.15);
}

/** A pine: tiers of drooping, ragged skirts on a hidden trunk, base at y = 0. */
export function pine(seed: number): BufferGeometry {
  const r = mulberry32(seed);
  const tiers = 5, parts: BufferGeometry[] = [];
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const radius = 1.85 - f * 1.35, h = 2.2 - f * 0.9, y = 1.6 + f * 4.6;
    const g = new ConeGeometry(radius, h, 14, 3, true);
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const m = mergeVertices(g);
    const p = m.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yy = p.getY(i), z = p.getZ(i);
      const rim = smooth(0, -h / 2, yy); // 1 at the skirt's edge
      const ang = Math.atan2(z, x);
      const rag = 1 + (Math.sin(ang * 7 + seed + t) * 0.5 + bump(ang * 2 + t, seed) * 0.5) * 0.18 * rim;
      p.setXYZ(i, x * rag, yy - rim * rim * 0.35 * (0.6 + r() * 0.4), z * rag);
    }
    m.translate(0, y, 0);
    m.computeVertexNormals();
    shade(m, (x, yy, z) => (0.55 + 0.45 * f) * (0.75 + 0.25 * Math.min(1, Math.hypot(x, z) / radius)) * (0.92 + 0.08 * smooth(0, 1, (yy - y) / h + 0.5)));
    parts.push(m);
  }
  const trunk = shade(new CylinderGeometry(0.16, 0.3, 2.2, 8).translate(0, 1.1, 0), () => 0.8);
  trunk.deleteAttribute("uv");
  parts.push(trunk);
  return mergeGeometries(parts);
}

/** A broadleaf trunk with its main limbs, bent a little, base at y = 0. */
export function trunk(seed: number): BufferGeometry {
  const r = mulberry32(seed);
  const limb = (r0: number, r1: number, len: number) => {
    const g = new CylinderGeometry(r1, r0, len, 7, 4);
    g.deleteAttribute("uv");
    g.translate(0, len / 2, 0);
    const p = g.attributes.position, lean = (r() - 0.5) * 0.25;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (p.getY(i) / len) ** 2 * lean);
    return g;
  };
  const parts = [limb(0.34, 0.2, 3.1)];
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const g = limb(0.11, 0.05, 1.5 + r() * 0.5).rotateZ(-(0.55 + r() * 0.35));
    g.rotateY(a).translate(0, 2.3 + r() * 0.6, 0);
    parts.push(g);
  }
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  return shade(m, (_x, y) => 0.65 + 0.35 * smooth(0, 2.5, y));
}

/** A boulder, mossy on top. Moss is the green channel's job: see rocks. */
export function boulder(seed: number, detail: number): BufferGeometry {
  const g = lump(1, detail, 0.35, seed * 1.7).scale(1, 0.75, 1);
  const p = g.attributes.position, nrm = g.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const moss = smooth(0.55, 0.85, nrm.getY(i)) * smooth(-0.1, 0.4, bump(p.getX(i) * 2, p.getZ(i) * 2 + seed));
    const ao = 0.6 + 0.4 * smooth(-0.7, 0.5, p.getY(i));
    c[i * 3] = ao * (1 - moss * 0.45);
    c[i * 3 + 1] = ao * (1 - moss * 0.1);
    c[i * 3 + 2] = ao * (1 - moss * 0.6);
  }
  g.setAttribute("color", new BufferAttribute(c, 3));
  return g;
}

/** Grows `count` variants of a shape from consecutive seeds. */
export const variants = (count: number, grow: (seed: number) => BufferGeometry, rand: Rand) =>
  Array.from({ length: count }, () => grow(Math.floor(rand() * 1e6)));

/**
 * A lit material whose vertices sway in the wind: more the higher they sit
 * above the ground (`base` is how high the shape's origin is placed), with a
 * flutter on top for leaves. Instanced meshes only,
 * with an identity model matrix (the instance matrix is the world).
 */
export function swaying(shared: Shared, params: MeshStandardMaterialParameters, bend: number, flutter: number, base = 0) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...params });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime, uWind;\n${NOISE_GLSL}\n${WIND_GLSL}`)
      .replace("#include <project_vertex>", /* glsl */ `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec3 root = vec3(instanceMatrix[3]);
        float above = max(mvPosition.y - root.y + ${base.toFixed(3)}, 0.0);
        vec2 w = windAt(root.xz, uTime, uWind);
        float phase = dot(root.xz, vec2(0.37, 0.61));
        vec2 sway = w * above * above * ${bend.toFixed(5)};
        sway += vec2(sin(uTime * 7.0 + phase + mvPosition.y * 3.0), cos(uTime * 6.3 + phase + mvPosition.x * 2.0)) * ${flutter.toFixed(5)} * length(w) * above;
        mvPosition.xz += sway;
        mvPosition.y -= dot(sway, sway) * 0.15;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `);
  };
  return material;
}
