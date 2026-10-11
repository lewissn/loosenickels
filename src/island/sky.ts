import {
  BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, HemisphereLight, Mesh, MeshBasicMaterial,
  Points, PointsMaterial, SphereGeometry, Vector3, type Scene,
} from "three";
import { smooth } from "./noise";
import type { Detail } from "./detail";
import type { Season } from "./seasons";

/* Sun, moon, stars, and everything that follows the time of day: sky and
   fog colour, ambient light, shadows. At night the one directional light
   becomes moonlight from the opposite side. */

const SKY = { night: new Color(0x0b1226), dusk: new Color(0xe8946a), day: new Color(0x8ec3e6), winter: new Color(0xb9c6cf) };
const HEMI = { night: new Color(0x2a3a66), day: new Color(0xcfe6ff) };
const SUNC = { low: new Color(0xffa86e), high: new Color(0xfff4e2), moon: new Color(0x9fb4ff) };

export function createSky(scene: Scene, detail: Detail) {
  const background = new Color();
  scene.background = background;
  const fog = new Fog(0x9fc9e8, 180, 520);
  scene.fog = fog;

  const hemi = new HemisphereLight(0xcfe6ff, 0x4d4636, 0.7);
  const sun = new DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(detail.shadowMap, detail.shadowMap);
  Object.assign(sun.shadow.camera, { left: -115, right: 115, top: 115, bottom: -115, near: 10, far: 520 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 1.5;
  scene.add(hemi, sun, sun.target);

  const sunDisc = new Mesh(new SphereGeometry(10, 16, 12), new MeshBasicMaterial({ color: 0xffe2a8, fog: false }));
  const moonDisc = new Mesh(new SphereGeometry(6, 16, 12), new MeshBasicMaterial({ color: 0xe6ebf5, fog: false }));
  scene.add(sunDisc, moonDisc);

  const starGeo = new BufferGeometry();
  {
    const n = 900, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95);
      a[i * 3] = Math.sin(v) * Math.cos(u) * 900;
      a[i * 3 + 1] = Math.cos(v) * 900 - 60;
      a[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 900;
    }
    starGeo.setAttribute("position", new BufferAttribute(a, 3));
  }
  const starMat = new PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new Points(starGeo, starMat));

  const sunDir = new Vector3();

  /** dayF runs 0–1 from midnight. Returns the sun's elevation, -1 to 1. */
  function update(dayF: number, season: Season) {
    const a = dayF * Math.PI * 2 - Math.PI / 2;
    const e = Math.sin(a);
    sunDir.set(Math.cos(a) * 0.85, e, 0.45).normalize();
    const dayAmt = smooth(-0.05, 0.25, e), nightAmt = 1 - smooth(-0.22, 0.02, e);

    if (e > 0) background.copy(SKY.dusk).lerp(SKY.day, smooth(0, 0.28, e));
    else background.copy(SKY.night).lerp(SKY.dusk, smooth(-0.22, 0, e));
    background.lerp(SKY.winter, season.snow * 0.35 * dayAmt);
    fog.color.copy(background);

    if (e > -0.02) {
      sun.position.copy(sunDir).multiplyScalar(260);
      sun.intensity = 2.8 * smooth(-0.02, 0.2, e);
      sun.color.copy(SUNC.low).lerp(SUNC.high, smooth(0, 0.4, e));
    } else {
      sun.position.copy(sunDir).multiplyScalar(-260);
      sun.intensity = 0.8 * smooth(0.02, 0.25, -e);
      sun.color.copy(SUNC.moon);
    }
    hemi.intensity = 0.32 + 0.45 * dayAmt;
    hemi.color.copy(HEMI.night).lerp(HEMI.day, dayAmt);

    sunDisc.position.copy(sunDir).multiplyScalar(620);
    sunDisc.visible = e > -0.12;
    sunDisc.material.color.copy(SUNC.low).lerp(SUNC.high, smooth(0, 0.35, e));
    moonDisc.position.copy(sunDir).multiplyScalar(-620);
    moonDisc.visible = e < 0.12;
    starMat.opacity = nightAmt * 0.9;
    return e;
  }

  return { update };
}
