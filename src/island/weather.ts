import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DynamicDrawUsage, Group, IcosahedronGeometry,
  InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicMaterial, Points, PointsMaterial, ShaderMaterial,
  Vector3, type Scene,
} from "three";
import { softDot } from "./materials";
import type { Shared } from "./shared";
import type { Detail } from "./detail";
import type { Season } from "./seasons";
import type { Rand } from "./noise";

/* Clouds that drift in slow circles and cast shadows, and whatever the
   season lets fall: petals, leaves, snow.

   A cloud is a dozen soft puffs, each a camera-facing sprite, lit white on
   the sun's side and taking the sky's colour underneath. Sprites cast no
   shadow, so each cloud trails a few invisible lumps that do. */

const cloudVertex = /* glsl */ `
attribute vec3 aCentre;
attribute vec4 aPuff; // offset from the cloud's middle (xyz), size
varying vec2 vUv;
varying float vLight;
varying float vFogDepth;
uniform vec3 uSunDir;
void main() {
  vUv = position.xy + 0.5;
  // Lit from the sun's side, darker underneath.
  vec3 o = normalize(aPuff.xyz * vec3(1.0, 1.8, 1.0) + vec3(0.0, 0.8, 0.0));
  vLight = clamp(dot(o, uSunDir) * 0.3 + 0.62 + aPuff.y * 0.06, 0.0, 1.0);
  vec4 mv = viewMatrix * vec4(aCentre, 1.0);
  mv.xy += position.xy * aPuff.w;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const cloudFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLit, uShade, uFogColor, uSunDir;
uniform float uFogNear, uFogFar;
varying vec2 vUv;
varying float vLight;
varying float vFogDepth;
void main() {
  float a = texture2D(uMap, vUv).a;
  if (a < 0.01) discard;
  vec3 col = mix(uShade, uLit, vLight);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vFogDepth) * 0.6);
  gl_FragColor = vec4(col, a * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** A soft cumulus puff: overlapping round blobs, faded at the edges. */
function puffTexture(rand: Rand) {
  const size = 128, c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, d = rand() * 22, r = 20 + rand() * 24;
      const x = 64 + Math.cos(a) * d, y = 66 + Math.sin(a) * d * 0.7;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(255,255,255,0.5)");
      grad.addColorStop(0.55, "rgba(255,255,255,0.3)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    }
  }
  return new CanvasTexture(c);
}

export function createClouds(scene: Scene, rand: Rand, shared: Shared) {
  const puffs: { cloud: number; x: number; y: number; z: number; size: number }[] = [];
  const clouds: { r: number; a: number; y: number; sp: number; shadow: Group }[] = [];
  const shadowMat = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const shadowGeo = new IcosahedronGeometry(1, 1);

  for (let i = 0; i < 10; i++) {
    const shadow = new Group();
    const count = 9 + Math.floor(rand() * 7), len = 10 + rand() * 10;
    for (let p = 0; p < count; p++) {
      const f = p / (count - 1) - 0.5, mid = 1 - Math.abs(f) * 1.6;
      const x = f * len + (rand() - 0.5) * 3, z = (rand() - 0.5) * 6, y = rand() * 3 * mid;
      const size = 10 + rand() * 8 * mid;
      puffs.push({ cloud: i, x, y, z, size });
      // An invisible stand-in, so the cloud still casts a shadow.
      const m = new Mesh(shadowGeo, shadowMat);
      m.position.set(x, y, z);
      m.scale.set(size * 0.3, size * 0.2, size * 0.3);
      m.castShadow = true;
      shadow.add(m);
    }
    // Orbits stay over the island, well inside the camera's starting ring
    // (about 150 out), so no cloud drifts up against the lens.
    clouds.push({ r: 15 + rand() * 60, a: rand() * Math.PI * 2, y: 54 + rand() * 14, sp: 0.008 + rand() * 0.012, shadow });
    scene.add(shadow);
  }

  const n = puffs.length;
  const geo = new InstancedBufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const centre = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
  centre.setUsage(DynamicDrawUsage);
  geo.setAttribute("aCentre", centre);
  geo.setAttribute("aPuff", new InstancedBufferAttribute(new Float32Array(puffs.flatMap((p) => [p.x, p.y, p.z, p.size])), 4));
  geo.instanceCount = n;

  const lit = new Color(), shade = new Color(), fogColor = new Color();
  const material = new ShaderMaterial({
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    uniforms: {
      uMap: { value: puffTexture(rand) },
      uSunDir: shared.uSunDir,
      uLit: { value: lit }, uShade: { value: shade }, uFogColor: { value: fogColor },
      uFogNear: { value: 200 }, uFogFar: { value: 700 },
    },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const white = new Color(1, 1, 1), v = new Vector3();
  return function update(dt: number) {
    // Sunlit white by day, warm at dusk; the shadowed side takes the sky.
    lit.copy(shared.uSkyHorizon.value).multiplyScalar(0.35).add(shared.uSunColor.value).multiplyScalar(0.9).lerp(white, 0.15 * (1 - shared.uNight.value));
    shade.copy(shared.uSkyZenith.value).lerp(shared.uSkyHorizon.value, 0.5).multiplyScalar(0.85);
    fogColor.copy(shared.uSkyHorizon.value);
    for (const c of clouds) {
      c.a += c.sp * dt;
      c.shadow.position.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r);
      c.shadow.rotation.y = -c.a;
      c.shadow.updateMatrixWorld();
    }
    puffs.forEach((p, i) => {
      const c = clouds[p.cloud];
      v.set(p.x, p.y, p.z).applyMatrix4(c.shadow.matrixWorld);
      centre.setXYZ(i, v.x, v.y, v.z);
    });
    centre.needsUpdate = true;
  };
}

export function createFalling(scene: Scene, detail: Detail) {
  const n = detail.particles;
  const pos = new Float32Array(n * 3), speed = new Float32Array(n), phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 120;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 80;
    pos[i * 3 + 2] = Math.sin(a) * r;
    speed[i] = 0.7 + Math.random() * 0.6;
    phase[i] = Math.random() * 6.28;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));

  const material = new PointsMaterial({ size: 0.6, map: softDot(), transparent: true, depthWrite: false, opacity: 0 });
  const points = new Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);

  return function update(dt: number, t: number, season: Season) {
    material.opacity = season.fxAmt;
    points.visible = season.fxAmt > 0.02;
    if (!points.visible) return;
    material.color.copy(season.fx);
    material.size = season.fxSize;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      pos[o + 1] -= season.fxSpeed * speed[i] * dt;
      pos[o] += Math.sin(t * 1.3 + phase[i]) * dt * 0.9;
      pos[o + 2] += Math.cos(t * 1.1 + phase[i]) * dt * 0.6;
      if (pos[o + 1] < -1) pos[o + 1] = 70 + Math.random() * 10;
    }
    geo.attributes.position.needsUpdate = true;
  };
}
