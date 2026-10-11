import { Color, Mesh, PlaneGeometry, RingGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, type Scene, type Texture } from "three";
import { DEPTH_RANGE, TERRAIN_SIZE } from "./terrain";
import { NOISE_GLSL, type Shared } from "./shared";
import type { Detail } from "./detail";

/* The sea.

   Swell is computed on the GPU. Colour comes from how deep the water
   really is (read from the terrain's height map): clear turquoise over the
   sand, deepening to blue. Foam gathers and breaks along the shore. The
   surface reflects the sky by Fresnel, so it mirrors the sunset at a low
   angle and shows the sand when looked down into, and the sun leaves a
   glint bright enough to bloom. */

const vertex = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
varying vec3 vSwellN;
#include <fog_pars_vertex>
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  float t = uTime;
  // The swell dies away before the far sea, which is flat.
  float k = 1.0 - smoothstep(240.0, 290.0, length(p.xz));
  float a1 = p.x * 0.08 + t * 1.1, a2 = p.z * 0.07 + t * 0.9, a3 = (p.x + p.z) * 0.15 + t * 1.7;
  p.y += (sin(a1) * 0.32 + cos(a2) * 0.28 + sin(a3) * 0.1) * k;
  float dx = (cos(a1) * 0.32 * 0.08 + cos(a3) * 0.1 * 0.15) * k;
  float dz = (-sin(a2) * 0.28 * 0.07 + cos(a3) * 0.1 * 0.15) * k;
  vSwellN = normalize(vec3(-dx, 1.0, -dz));
  vWPos = p;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform float uTime, uNight, uSize, uClip, uRain;
uniform vec2 uDepthRange;
uniform sampler2D uHeight;
uniform vec3 uDeep, uShallow, uSkyZenith, uSkyHorizon, uSunDir, uSunColor;
varying vec3 vWPos;
varying vec3 vSwellN;
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}

// Small ripples: a few crossing wave trains, as a slope.
vec2 ripples(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.5, 0.86), d3 = vec2(0.96, -0.28), d4 = vec2(-0.2, -0.98);
  g += d1 * cos(dot(p, d1) * 0.9 + t * 1.9) * 0.07;
  g += d2 * cos(dot(p, d2) * 1.4 + t * 2.3) * 0.05;
  g += d3 * cos(dot(p, d3) * 2.3 + t * 3.1) * 0.035;
  g += d4 * cos(dot(p, d4) * 3.7 + t * 3.9) * 0.025;
  return g;
}

void main() {
  // The near sea is square; past the far sea's inner edge it gives way.
  if (length(vWPos.xz) > uClip) discard;
  vec2 uv = vWPos.xz / uSize + 0.5;
  float ground = uDepthRange.x;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0)
    ground = mix(uDepthRange.x, uDepthRange.y, texture2D(uHeight, uv).r);
  float depth = max(vWPos.y - ground, 0.0);

  float dist = length(cameraPosition - vWPos);
  // Ripples fade with distance, where they would only shimmer.
  vec2 g = ripples(vWPos.xz, uTime) * (1.0 - smoothstep(60.0, 260.0, dist));
  // Rain pocks the surface.
  vec2 q = vWPos.xz * 3.1;
  g += (vec2(vnoise(q + uTime * vec2(9.0, 5.0)), vnoise(q * 1.3 - uTime * vec2(6.0, 8.0))) - 0.5) * 0.5 * uRain * (1.0 - smoothstep(20.0, 120.0, dist));
  vec3 N = normalize(vSwellN + vec3(-g.x, 0.0, -g.y));
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 R = reflect(-V, N);

  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(max(R.y, 0.0), 0.45));
  vec3 ambient = mix(uSkyHorizon, uSkyZenith, 0.5) * 0.55;
  vec3 light = ambient + uSunColor * 0.55 * max(uSunDir.y, 0.0);

  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.22)) * light * 1.25;
  vec3 col = mix(body, sky, fres * 0.85);

  float sun = max(dot(R, uSunDir), 0.0);
  col += uSunColor * (pow(sun, 260.0) * 7.0 + pow(sun, 40.0) * 0.12) * (1.0 - uNight * 0.6);

  // Foam: a fringe on the sand, and bands that roll in and break up.
  float n = vnoise(vWPos.xz * 0.45 + uTime * 0.12);
  float bands = sin(depth * 7.0 - uTime * 1.5 + n * 5.0) * 0.5 + 0.5;
  float fringe = 1.0 - smoothstep(0.0, 0.22, depth + (n - 0.5) * 0.12);
  float foam = max(fringe * 0.85, smoothstep(0.55, 0.95, bands) * (1.0 - smoothstep(0.1, 1.2, depth)) * (0.4 + n * 0.6));
  col = mix(col, vec3(0.95, 0.97, 1.0) * (light * 1.2 + 0.05), foam);

  float alpha = mix(0.35, 0.94, smoothstep(0.0, 4.5, depth));
  alpha = max(max(alpha, foam), fres);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const FAR_SEA = 292;

export function createWater(scene: Scene, detail: Detail, shared: Shared, heightMap: Texture) {
  const material = (clip: number) => new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      uTime: shared.uTime,
      uNight: shared.uNight,
      uRain: shared.uRain,
      uSkyZenith: shared.uSkyZenith,
      uSkyHorizon: shared.uSkyHorizon,
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uHeight: { value: heightMap },
      uSize: { value: TERRAIN_SIZE },
      uDepthRange: { value: new Vector2(...DEPTH_RANGE) },
      uShallow: { value: new Color(0x3fd6c6) },
      uDeep: { value: new Color(0x0d4f78) },
      uClip: { value: clip },
    },
    transparent: true,
    fog: true,
  });

  const seg = detail.waterSegments;
  const near = new Mesh(new PlaneGeometry(600, 600, seg, seg).rotateX(-Math.PI / 2), material(FAR_SEA));
  const far = new Mesh(new RingGeometry(FAR_SEA, 5000, 96).rotateX(-Math.PI / 2), material(1e9));
  far.position.y = -0.05;
  scene.add(near, far);
}
