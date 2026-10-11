import {
  BufferAttribute, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshStandardMaterial, type Scene,
} from "three";
import { NOISE_GLSL, WIND_GLSL, type Shared } from "./shared";
import type { Detail } from "./detail";
import type { World } from "./world";

/* Grass that moves in the wind.

   Each blade is one instance of a small tapered strip, bent over by the
   same gusts that sway the trees, so you can watch a gust cross a meadow.
   It grows in drifts over the gentle ground (the meadows, the clearings),
   takes the season's colour, and shrinks under the snow. Blades are lit as
   if they were the ground they stand on, so a field reads as one surface
   from afar and only becomes blades up close. */

function bladeGeometry() {
  // Three pairs of vertices tapering to a tip, y from 0 to 1.
  const ys = [0, 0.38, 0.72, 1], ws = [1, 0.78, 0.45, 0];
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  ys.forEach((y, i) => {
    if (i < 3) { pos.push(-0.5 * ws[i], y, 0, 0.5 * ws[i], y, 0); nrm.push(0, 1, 0, 0, 1, 0); }
    else { pos.push(0, y, 0); nrm.push(0, 1, 0); }
  });
  for (let i = 0; i < 2; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  idx.push(4, 5, 6);
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  g.setIndex(idx);
  return g;
}

export function createGrass(scene: Scene, world: World, detail: Detail, shared: Shared) {
  const { height, normalY, noise, noise2 } = world;
  const want = detail.mobile ? 70000 : 220000;
  const offset = new Float32Array(want * 3), params = new Float32Array(want * 4);
  let n = 0;
  for (let tries = 0; n < want && tries < want * 12; tries++) {
    const x = (Math.random() * 2 - 1) * 95, z = (Math.random() * 2 - 1) * 95;
    // Drifts: dense in the meadows, thinning to nothing under the woods.
    const drift = noise2(x * 0.035, z * 0.035) * -1 + noise(x * 0.2 + 9, z * 0.2) * 0.35;
    if (drift < -0.2 || Math.random() > (drift + 0.2) * 1.4) continue;
    const h = height(x, z);
    if (h < 1.3 || h > 20 || normalY(x, z) < 0.82) continue;
    if (world.nearSite(x, z, 5.5)) continue;
    offset.set([x, h - 0.05, z], n * 3);
    params.set([Math.random() * Math.PI * 2, 0.35 + Math.random() * 0.5 + Math.max(0, drift) * 0.45, 0.1 + Math.random() * 0.08, Math.random()], n * 4);
    n++;
  }

  const geo = bladeGeometry();
  geo.setAttribute("aOffset", new InstancedBufferAttribute(offset.subarray(0, n * 3), 3));
  geo.setAttribute("aParams", new InstancedBufferAttribute(params.subarray(0, n * 4), 4));
  geo.instanceCount = n;

  const material = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.9, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: shared.uTime, uWind: shared.uWind, uSnow: shared.uSnow, uGrass: shared.uGrass, uMeadow: shared.uMeadow,
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute vec3 aOffset;
        attribute vec4 aParams;
        uniform float uTime, uWind, uSnow;
        uniform vec3 uGrass, uMeadow;
        varying vec3 vBlade;
        ${NOISE_GLSL}
        ${WIND_GLSL}`)
      .replace("#include <begin_vertex>", /* glsl */ `
        float along = position.y;
        float h = aParams.y * (1.0 - uSnow * 0.75);
        vec3 transformed = vec3(position.x * aParams.z, along * h, 0.0);
        float c = cos(aParams.x), s = sin(aParams.x);
        transformed.xz = vec2(c * transformed.x, s * transformed.x);
        // Bend: the tip goes furthest, and drops as it leans.
        vec2 w = windAt(aOffset.xz, uTime, uWind);
        float flick = sin(uTime * 4.0 + aParams.w * 30.0 + aOffset.x) * 0.15;
        vec2 lean = (w * 0.55 + vec2(0.12) * (aParams.w - 0.5) + flick * 0.1) * along * along * h;
        transformed.xz += lean;
        transformed.y -= dot(lean, lean) * 0.4;
        transformed += aOffset;
        // Root dark, tip catching the light; each blade a shade apart.
        vec3 tint = mix(uGrass, uMeadow, aParams.w);
        vBlade = mix(tint * 0.62, tint * (1.08 + aParams.w * 0.2), smoothstep(0.0, 1.0, along));
        vBlade = mix(vBlade, vec3(0.86, 0.88, 0.9), uSnow * 0.5 * along);
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBlade;")
      .replace("#include <color_fragment>", "diffuseColor.rgb = vBlade;")
      // Both faces of a blade are lit as the ground is, never as its underside.
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal);");
  };

  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
