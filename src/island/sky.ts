import {
  BackSide, BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, HemisphereLight, Mesh, Points,
  PointsMaterial, ShaderMaterial, SphereGeometry, Vector3, type Scene,
} from "three";
import { smooth } from "./noise";
import type { Detail } from "./detail";
import type { Season } from "./seasons";
import type { Shared } from "./shared";

/* The sky, and everything that follows the time of day.

   The sky is a dome drawn around the camera: a gradient from horizon to
   zenith, a halo round the sun that widens and warms as it sets, a band of
   colour along the horizon at dusk, the sun and moon themselves, and stars.
   The fog takes the horizon's colour, so the far sea melts into the sky.

   One directional light is the sun by day and the moon by night. */

const ZENITH = { night: new Color(0x040917), dusk: new Color(0x34467e), day: new Color(0x2c74c6), winter: new Color(0x7ea4c6) };
const HORIZON = { night: new Color(0x142145), dusk: new Color(0xf09a62), day: new Color(0xa3cbe8), winter: new Color(0xd6e1ea) };
const HEMI = { night: new Color(0x2a3a66), day: new Color(0xcfe6ff) };
/** An overcast sky by day; darkened with the light at night. */
const GREY = { zenith: new Color(0x59636e), horizon: new Color(0x939ca4) };
const grey = new Color();
const FLASH = new Color(0.82, 0.86, 1);
const SUNC = { low: new Color(0xffa060), high: new Color(0xfff2dd), moon: new Color(0x9fb4ff) };

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uZenith, uHorizon, uSunTrue, uSunColor;
uniform float uDusk, uNight, uClear, uFlash;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.45));
  // Below the horizon: the same horizon, deepening (mostly hidden by sea).
  col = mix(col, uHorizon * 0.7, smoothstep(0.0, -0.25, d.y));

  float mu = dot(d, uSunTrue);
  float day = 1.0 - uNight;
  // A halo round the sun, wider and warmer as it sets.
  float halo = pow(max(mu, 0.0), mix(18.0, 6.0, uDusk)) * mix(0.35, 0.8, uDusk);
  // Cloud cover hides the sun and moon and mutes the sunset.
  col += uSunColor * halo * day * mix(0.35, 1.0, uClear);
  // The band of colour along the horizon at dusk, strongest beneath the sun.
  float band = exp(-abs(d.y) * 9.0) * pow(mu * 0.5 + 0.5, 3.0) * uDusk;
  col += uSunColor * band * 0.6 * mix(0.3, 1.0, uClear);
  // The sun, bright enough to bloom.
  col += uSunColor * smoothstep(0.99935, 0.99965, mu) * 18.0 * step(-0.05, uSunTrue.y) * uClear;
  // The moon, opposite, with a faint halo of its own.
  float mm = dot(d, -uSunTrue);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.9998, mm) * 3.0 + pow(max(mm, 0.0), 60.0) * 0.08) * uNight * uClear;
  // Lightning lights the whole sky from within the cloud.
  col += vec3(0.75, 0.8, 1.0) * uFlash * 0.5 * up;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSky(scene: Scene, detail: Detail, shared: Shared) {
  const background = new Color();
  scene.background = background;
  const fog = new Fog(0x9fc9e8, 160, 560);
  scene.fog = fog;

  const hemi = new HemisphereLight(0xcfe6ff, 0x4d4636, 0.7);
  const sun = new DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(detail.shadowMap, detail.shadowMap);
  Object.assign(sun.shadow.camera, { left: -115, right: 115, top: 115, bottom: -115, near: 10, far: 520 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 2.5;
  scene.add(hemi, sun, sun.target);

  const sunTrue = new Vector3();
  const skyMat = new ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms: {
      uZenith: shared.uSkyZenith,
      uHorizon: shared.uSkyHorizon,
      uSunTrue: { value: sunTrue },
      uSunColor: { value: new Color() },
      uDusk: { value: 0 },
      uNight: shared.uNight,
      uClear: { value: 1 },
      uFlash: shared.uFlash,
    },
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new Mesh(new SphereGeometry(1000, 48, 24), skyMat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.onBeforeRender = (_r, _s, camera) => dome.position.copy(camera.position);
  scene.add(dome);

  const starGeo = new BufferGeometry();
  {
    const n = 1400, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95);
      a[i * 3] = Math.sin(v) * Math.cos(u) * 900;
      a[i * 3 + 1] = Math.cos(v) * 900 - 60;
      a[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 900;
    }
    starGeo.setAttribute("position", new BufferAttribute(a, 3));
  }
  const starMat = new PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.onBeforeRender = (_r, _s, camera) => stars.position.copy(camera.position);
  scene.add(stars);

  /** dayF runs 0–1 from midnight. Returns the sun's elevation, -1 to 1. */
  function update(dayF: number, season: Season) {
    const a = dayF * Math.PI * 2 - Math.PI / 2;
    const e = Math.sin(a);
    sunTrue.set(Math.cos(a) * 0.85, e, 0.45).normalize();
    const dayAmt = smooth(-0.05, 0.25, e), nightAmt = 1 - smooth(-0.22, 0.02, e);
    const dusk = (1 - smooth(0.02, 0.32, Math.abs(e + 0.03))) * (1 - nightAmt * 0.6);

    const zenith = shared.uSkyZenith.value, horizon = shared.uSkyHorizon.value;
    if (e > 0) {
      zenith.copy(ZENITH.dusk).lerp(ZENITH.day, smooth(0, 0.3, e));
      horizon.copy(HORIZON.dusk).lerp(HORIZON.day, smooth(0, 0.28, e));
    } else {
      zenith.copy(ZENITH.night).lerp(ZENITH.dusk, smooth(-0.22, 0, e));
      horizon.copy(HORIZON.night).lerp(HORIZON.dusk, smooth(-0.22, 0, e));
    }
    zenith.lerp(ZENITH.winter, season.snow * 0.35 * dayAmt);
    horizon.lerp(HORIZON.winter, season.snow * 0.35 * dayAmt);
    const cover = shared.uOvercast.value, rain = shared.uRain.value, light = 0.12 + 0.88 * dayAmt;
    zenith.lerp(grey.copy(GREY.zenith).multiplyScalar(light), cover * 0.85);
    horizon.lerp(grey.copy(GREY.horizon).multiplyScalar(light), cover * 0.8);
    skyMat.uniforms.uClear.value = 1 - cover * 0.92;
    // Lightning lights the air itself, so sea and sky flash together.
    horizon.lerp(FLASH, shared.uFlash.value * 0.55);
    background.copy(horizon);
    fog.color.copy(horizon);
    // Rain closes the distance in.
    fog.near = 160 - rain * 100;
    fog.far = 560 - rain * 300;

    const sunColor = skyMat.uniforms.uSunColor.value as Color;
    sunColor.copy(SUNC.low).lerp(SUNC.high, smooth(0, 0.4, e));
    skyMat.uniforms.uDusk.value = dusk;

    if (e > -0.02) {
      sun.position.copy(sunTrue).multiplyScalar(260);
      sun.intensity = 2.8 * smooth(-0.02, 0.2, e);
      sun.color.copy(sunColor);
      shared.uSunDir.value.copy(sunTrue);
    } else {
      sun.position.copy(sunTrue).multiplyScalar(-260);
      sun.intensity = 0.8 * smooth(0.02, 0.25, -e);
      sun.color.copy(SUNC.moon);
      shared.uSunDir.value.copy(sunTrue).negate();
    }
    sun.intensity *= 1 - cover * 0.78;
    shared.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity / 2.8);
    shared.uNight.value = nightAmt;
    // The sky lights the ground too: warm at dusk, so a backlit island
    // glows at the edges instead of going black.
    hemi.intensity = 0.4 + 0.4 * dayAmt + dusk * 0.35 * (1 - cover) + shared.uFlash.value * 2.5;
    hemi.color.copy(HEMI.night).lerp(HEMI.day, dayAmt).lerp(horizon, dusk * 0.6 + cover * 0.4);
    starMat.opacity = nightAmt * 0.9 * (1 - cover);
    return e;
  }

  return { update };
}
