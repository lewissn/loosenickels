import { Color, Vector3 } from "three";

/* Uniforms every custom shader reads, updated once a frame by the engine:
   the time, the wind, the sun, the sky, and the season. Materials hold
   references to these objects, so setting `.value` here reaches them all. */

export function createShared() {
  return {
    uTime: { value: 0 },
    /** Direction towards the sun (or the moon, at night). */
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color(1, 1, 1) },
    uSkyZenith: { value: new Color() },
    uSkyHorizon: { value: new Color() },
    /** 0 by day, 1 at full night. */
    uNight: { value: 0 },
    uGrass: { value: new Color() },
    uMeadow: { value: new Color() },
    uSnow: { value: 0 },
    uSnowLine: { value: 30 },
    /** 0 to 1: a light breeze to a blustery day. */
    uWind: { value: 0.5 },
  };
}

export type Shared = ReturnType<typeof createShared>;

/** Hash, value noise and fbm in 2D, for shaders. */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

/** Gusts that roll across the island: a slow travelling swell plus flutter. */
export const WIND_GLSL = /* glsl */ `
vec2 windAt(vec2 xz, float time, float strength) {
  float gust = vnoise(xz * 0.03 + vec2(time * 0.15, time * 0.07));
  float sway = sin(time * 1.6 + xz.x * 0.25 + xz.y * 0.18) * 0.5 + sin(time * 2.7 + xz.x * 0.6) * 0.25;
  float w = (0.35 + gust * 1.1) * strength;
  return vec2(0.8, 0.6) * w * (0.6 + sway * 0.4);
}
`;
