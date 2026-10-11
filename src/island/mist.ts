import { Color, Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, type Scene, type Texture } from "three";
import { smooth } from "./noise";
import { GROUND_RANGE, TERRAIN_SIZE } from "./terrain";
import { NOISE_GLSL, type Shared } from "./shared";
import type { Detail } from "./detail";

/* Mist in the hollows.

   A few soft horizontal layers that only gather where the ground dips
   below them, so the mist pools in the low meadows and around the shore
   and thins to nothing on the hills. It drifts, comes in strongest around
   dawn (most of all in autumn), lingers faintly at night, and thickens
   after rain. It's lit by whatever light there is: gold at sunrise, blue
   under the moon. */

const vertex = /* glsl */ `
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mvPosition = viewMatrix * vec4(vW, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform sampler2D uGround;
uniform vec2 uRange;
uniform float uSize, uTime, uAmount, uLayer, uPer;
uniform vec3 uColor;
varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  vec2 uv = vW.xz / uSize + 0.5;
  float ground = mix(uRange.x, uRange.y, texture2D(uGround, uv).r);
  float above = vW.y - ground;
  // Pools in low ground; not over open water or the depths.
  float pool = smoothstep(0.0, 2.2, above) * (1.0 - smoothstep(4.5, 9.0, above));
  vec2 p = vW.xz + uLayer * 37.0;
  float n = fbm2(p * 0.03 + uTime * vec2(0.014, 0.006)) * 0.75 + fbm2(p * 0.085 - uTime * vec2(0.01, 0.02)) * 0.45;
  float a = pool * smoothstep(0.4, 0.78, n) * uAmount * uPer;
  // Lighter over the water than over the land.
  a *= mix(0.6, 1.0, smoothstep(-1.5, 0.5, ground));
  // A layer seen edge-on would show as a line; let it go.
  a *= smoothstep(0.03, 0.3, abs(normalize(vW - cameraPosition).y));
  // Never a flat sheet across the lens, and nothing past the island.
  a *= smoothstep(3.0, 22.0, distance(cameraPosition, vW));
  a *= 1.0 - smoothstep(95.0, 125.0, length(vW.xz));
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** How misty each season's dawns are: spring, summer, autumn, winter. */
const SEASONAL = [0.85, 0.55, 1, 0.75];

export function createMist(scene: Scene, detail: Detail, shared: Shared, groundMap: Texture) {
  const colour = new Color();
  // Many faint layers rather than a few thick ones, so no single edge shows.
  const heights = detail.mobile ? [1.8, 3.4, 5.0] : [1.2, 2.2, 3.2, 4.3, 5.5];
  const per = detail.mobile ? 0.36 : 0.27;
  const layers = heights.map((y, i) => {
    const material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.fog),
        uGround: { value: groundMap }, uRange: { value: new Vector2(...GROUND_RANGE) }, uSize: { value: TERRAIN_SIZE },
        uTime: shared.uTime, uAmount: { value: 0 }, uLayer: { value: i }, uColor: { value: colour }, uPer: { value: per },
      },
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const mesh = new Mesh(new PlaneGeometry(250, 250).rotateX(-Math.PI / 2), material);
    mesh.position.y = y;
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, material };
  });

  /** Returns how misty it is, 0 to 1. */
  return function update(dayF: number, yearPos: number) {
    const s = Math.floor(yearPos) % 4, k = yearPos - Math.floor(yearPos);
    const seasonal = SEASONAL[s] + (SEASONAL[(s + 1) % 4] - SEASONAL[s]) * k;
    const dawn = smooth(0.16, 0.235, dayF) * (1 - smooth(0.33, 0.43, dayF));
    const amount = Math.min(1, Math.max(dawn * seasonal, shared.uNight.value * 0.22) + shared.uWet.value * 0.35);
    colour.copy(shared.uSunColor.value).multiplyScalar(0.45 / 0.65).add(shared.uSkyHorizon.value).multiplyScalar(0.65).addScalar(0.06);
    for (const l of layers) {
      l.material.uniforms.uAmount.value = amount;
      l.mesh.visible = amount > 0.01;
    }
    return amount;
  };
}
