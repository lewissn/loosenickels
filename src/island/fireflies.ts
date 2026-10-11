import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, PointsMaterial, type Scene } from "three";
import { softDot } from "./materials";
import { smooth } from "./noise";
import type { Detail } from "./detail";
import type { Season } from "./seasons";
import type { World } from "./world";

/* Fireflies on summer nights.

   They gather in loose clouds over the low meadows, drift a little, and
   each blinks on its own slow rhythm: a short glow, then a longer dark.
   Too small to notice from the default view except as a shimmer, they
   come into their own when the camera is down among them following an
   animal. */

const GLOW = new Color(0xd8ff7a);
const SWARMS = 14;

export function createFireflies(scene: Scene, world: World, detail: Detail) {
  const { height, normalY } = world;
  const n = detail.fireflies;

  // Swarm centres on low, gentle ground; fireflies scattered around them.
  const centres: [number, number][] = [];
  for (let tries = 0; centres.length < SWARMS && tries < 2000; tries++) {
    const x = (Math.random() * 2 - 1) * 70, z = (Math.random() * 2 - 1) * 70, h = height(x, z);
    if (h > 1.5 && h < 10 && normalY(x, z) > 0.85) centres.push([x, z]);
  }
  if (centres.length === 0) centres.push([0, 0]);

  const home = new Float32Array(n * 3), wander = new Float32Array(n * 4), blink = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const [cx, cz] = centres[i % centres.length];
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 7;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    home[i * 3] = x;
    home[i * 3 + 1] = Math.max(height(x, z), 0.3);
    home[i * 3 + 2] = z;
    // Drift: two slow rates and two phases, so no two paths repeat together.
    wander[i * 4] = 0.15 + Math.random() * 0.25;
    wander[i * 4 + 1] = 0.12 + Math.random() * 0.2;
    wander[i * 4 + 2] = Math.random() * 6.28;
    wander[i * 4 + 3] = Math.random() * 6.28;
    // Blink: rate and phase.
    blink[i * 2] = 0.6 + Math.random() * 0.9;
    blink[i * 2 + 1] = Math.random() * 6.28;
  }

  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("color", new BufferAttribute(col, 3));
  const material = new PointsMaterial({
    size: 1.3, map: softDot(), vertexColors: true, transparent: true,
    blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
  });
  const points = new Points(geo, material);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);

  return function update(t: number, season: Season, elev: number) {
    const amount = season.fireflies * (1 - smooth(-0.14, 0.01, elev));
    points.visible = amount > 0.01;
    if (!points.visible) return;
    for (let i = 0; i < n; i++) {
      const o = i * 3, w = i * 4;
      const p1 = t * wander[w] + wander[w + 2], p2 = t * wander[w + 1] + wander[w + 3];
      pos[o] = home[o] + Math.sin(p1) * 1.8 + Math.sin(p2 * 2.3) * 0.5;
      pos[o + 1] = home[o + 1] + 0.7 + (Math.sin(p2) * 0.5 + 0.5) * 1.6;
      pos[o + 2] = home[o + 2] + Math.cos(p2) * 1.8 + Math.cos(p1 * 1.7) * 0.5;
      const s = Math.max(0, Math.sin(t * blink[i * 2] + blink[i * 2 + 1]));
      const b = s * s * s * s * amount * 1.6;
      col[o] = GLOW.r * b; col[o + 1] = GLOW.g * b; col[o + 2] = GLOW.b * b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
}
