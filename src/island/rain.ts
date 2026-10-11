import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, LineSegments, Mesh, MeshBasicMaterial, ShaderMaterial,
  TubeGeometry, Vector2, Vector3, type Camera, type Scene,
} from "three";
import { mulberry32, smooth } from "./noise";
import type { Detail } from "./detail";
import type { Shared } from "./shared";
import type { World } from "./world";

/* Rain, and now and then a thunderstorm.

   The weather runs to a schedule fixed by the seed and the clock, so a
   ?t= link always shows the same sky. Time is cut into slots of a little
   over half a day; each slot is wet or dry, with a chance that depends on
   the season (none in winter, which has its snow). Clouds gather before
   the rain arrives and linger after it stops, the wind gets up, and the
   ground stays wet a while. Summer showers are the likeliest to turn into
   storms. */

export type Forecast = "clear" | "rain" | "storm";

const SLOT = 0.55; // days
const RAIN_CHANCE = [0.35, 0.22, 0.45, 0]; // spring, summer, autumn, winter
const STORM_CHANCE = [0.15, 0.55, 0.3, 0];
const GREY_WINTER = 0.4; // chance a winter slot is merely overcast
const WHITE = new Color(1, 1, 1);

const rainVertex = /* glsl */ `
attribute vec4 aDrop; // x, z across the span (0–1), height phase (0–1), jitter
attribute float aEnd; // 0 at the drop's head, 1 at its tail
uniform vec3 uCenter;
uniform float uTime, uRain, uSpan, uHeight;
uniform vec2 uSlant;
varying float vShow;
void main() {
  float speed = 32.0 * (0.85 + aDrop.w * 0.3);
  float y = mod(aDrop.z * uHeight - uTime * speed, uHeight);
  vec3 p = vec3(uCenter.x + (aDrop.x - 0.5) * uSpan, uCenter.y - 12.0 + y, uCenter.z + (aDrop.y - 0.5) * uSpan);
  p.xz -= uSlant * y;
  vec3 dir = normalize(vec3(uSlant.x, -1.0, uSlant.y));
  p -= dir * aEnd * 1.8;
  // Light rain shows only some of the drops.
  vShow = step(fract(aDrop.z * 7.13 + aDrop.x * 3.7), uRain);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const rainFragment = /* glsl */ `
uniform vec3 uColor;
varying float vShow;
void main() {
  if (vShow < 0.5) discard;
  gl_FragColor = vec4(uColor, 0.28);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createRain(scene: Scene, world: World, detail: Detail, shared: Shared, camera: Camera, centre: Vector3, forced?: Forecast) {
  // ---- the schedule
  const slotWeather = (slot: number): { wet: number; storm: boolean; grey: boolean } => {
    if (forced) return { wet: forced === "clear" ? 0 : 1, storm: forced === "storm", grey: false };
    const r = mulberry32(world.seed * 7919 + slot * 104729);
    const season = Math.floor((((slot * SLOT) / 2.5) % 4 + 4) % 4);
    const a = r(), b = r(), c = r();
    if (season === 3) return { wet: 0, storm: false, grey: a < GREY_WINTER };
    const wet = a < RAIN_CHANCE[season] ? 0.55 + b * 0.45 : 0;
    const storm = wet > 0 && c < STORM_CHANCE[season];
    return { wet: storm ? 1 : wet, storm, grey: false };
  };

  // ---- the drops
  const n = detail.mobile ? 4000 : 9000;
  const drop = new Float32Array(n * 2 * 4), end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const d = [Math.random(), Math.random(), Math.random(), Math.random()];
    drop.set(d, i * 8);
    drop.set(d, i * 8 + 4);
    end[i * 2 + 1] = 1;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(n * 2 * 3), 3));
  geo.setAttribute("aDrop", new BufferAttribute(drop, 4));
  geo.setAttribute("aEnd", new BufferAttribute(end, 1));
  const colour = new Color();
  const material = new ShaderMaterial({
    vertexShader: rainVertex,
    fragmentShader: rainFragment,
    uniforms: {
      uCenter: { value: centre }, uTime: shared.uTime, uRain: shared.uRain,
      uSpan: { value: 150 }, uHeight: { value: 70 }, uSlant: { value: new Vector2(0.1, 0.075) }, uColor: { value: colour },
    },
    transparent: true,
    depthWrite: false,
  });
  const drops = new LineSegments(geo, material);
  drops.frustumCulled = false;
  drops.visible = false;
  scene.add(drops);

  // ---- lightning: a jagged glowing tube, bright enough to bloom hard.
  const boltMat = new MeshBasicMaterial({ color: new Color(5, 5.4, 7), toneMapped: false, transparent: true, fog: false });
  const bolt = new Mesh(new BufferGeometry(), boltMat);
  bolt.frustumCulled = false;
  bolt.visible = false;
  scene.add(bolt);
  let nextStrike = 3, sinceStrike = 99;
  const look = new Vector3();

  function strike() {
    sinceStrike = 0;
    // Somewhere you can see it: within a cone ahead of the camera.
    look.copy(centre).sub(camera.position).setY(0).normalize();
    // At or beyond what you're looking at, never right in front of you.
    const reach = Math.hypot(centre.x - camera.position.x, centre.z - camera.position.z);
    const a = Math.atan2(look.z, look.x) + (Math.random() - 0.5) * 0.9, r = reach * (0.85 + Math.random()) + 25;
    const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
    const ground = Math.max(world.height(x, z), 0);
    const pts: Vector3[] = [];
    let px = x + (Math.random() - 0.5) * 24, pz = z + (Math.random() - 0.5) * 24;
    const top = 50, steps = 18;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const jag = (1 - f * 0.6) * 3.2;
      px += (x - px) * 0.22 + (Math.random() - 0.5) * jag;
      pz += (z - pz) * 0.22 + (Math.random() - 0.5) * jag;
      pts.push(new Vector3(px, top + (ground - top) * f, pz));
    }
    bolt.geometry.dispose();
    bolt.geometry = new TubeGeometry(new CatmullRomCurve3(pts, false, "catmullrom", 0), steps * 3, 0.22, 4, false);
  }

  let wet = 0;
  return {
    /** Advances the weather. Writes uRain, uOvercast, uWet, uFlash and uWind. */
    update(simT: number, dt: number) {
      const days = simT / 48, slot = Math.floor(days / SLOT), f = days / SLOT - slot;
      const now = slotWeather(slot), next = slotWeather(slot + 1);
      const greyNow = now.grey ? 0.7 : 0, greyNext = next.grey ? 0.7 : 0;
      const a = now.wet, b = next.wet;
      let rain: number, cover: number;
      if (b > a) { cover = a + (b - a) * smooth(0.35, 0.85, f); rain = a + (b - a) * smooth(0.75, 1, f); }
      else { rain = a + (b - a) * smooth(0.4, 0.7, f); cover = a + (b - a) * smooth(0.65, 1, f); }
      cover = Math.max(cover, greyNow + (greyNext - greyNow) * smooth(0.5, 1, f));
      const storm = now.storm && rain > 0.5;

      wet += (rain - wet) * Math.min(1, dt * (rain > wet ? 0.4 : 0.035));
      shared.uRain.value = rain;
      shared.uOvercast.value = cover;
      shared.uWet.value = wet;
      shared.uWind.value = 0.5 + rain * 0.7 + (storm ? 0.35 : 0);

      drops.visible = rain > 0.01;
      colour.copy(shared.uSkyHorizon.value).lerp(WHITE, 0.35);
      material.uniforms.uSlant.value.set(0.08, 0.06).multiplyScalar(shared.uWind.value * 1.6);

      // Strikes come every few seconds in a storm, each a flicker of two or
      // three flashes.
      sinceStrike += dt;
      if (storm) { nextStrike -= dt; if (nextStrike <= 0) { strike(); nextStrike = 4 + Math.random() * 10; } }
      const pulse = (x: number) => (x < 0 ? 0 : Math.exp(-x * 13));
      const flash = Math.max(pulse(sinceStrike), pulse(sinceStrike - 0.17) * 0.75, pulse(sinceStrike - 0.34) * 0.45);
      shared.uFlash.value = flash;
      bolt.visible = flash > 0.15;
      boltMat.opacity = Math.min(1, flash * 1.5);
      return { rain, storm };
    },
  };
}
