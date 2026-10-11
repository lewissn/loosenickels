import {
  BufferAttribute, BufferGeometry, CanvasTexture, Group, IcosahedronGeometry, Mesh, Points, PointsMaterial,
  type Scene,
} from "three";
import { mat } from "./materials";
import type { Detail } from "./detail";
import type { Season } from "./seasons";
import type { Rand } from "./noise";

/* Clouds that drift in slow circles and cast shadows, and whatever the
   season lets fall: petals, leaves, snow. */

export function createClouds(scene: Scene, rand: Rand) {
  const cloudMat = mat(0xffffff, { roughness: 1, transparent: true, opacity: 0.93 });
  const clouds: { g: Group; r: number; a: number; y: number; sp: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const g = new Group();
    const puffs = 3 + Math.floor(rand() * 4);
    for (let p = 0; p < puffs; p++) {
      const r = 2.5 + rand() * 3;
      const m = new Mesh(new IcosahedronGeometry(r, 0), cloudMat);
      m.position.set((p - puffs / 2) * 4 + rand() * 2, rand() * 2, (rand() - 0.5) * 5);
      m.scale.y = 0.65;
      m.castShadow = true;
      g.add(m);
    }
    // Orbits stay over the island, well inside the camera's starting ring
    // (about 150 out), so no cloud drifts up against the lens.
    clouds.push({ g, r: 15 + rand() * 60, a: rand() * Math.PI * 2, y: 52 + rand() * 14, sp: 0.008 + rand() * 0.012 });
    scene.add(g);
  }

  return function update(dt: number) {
    for (const c of clouds) {
      c.a += c.sp * dt;
      c.g.position.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r);
      c.g.rotation.y = -c.a;
    }
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

  const dot = document.createElement("canvas");
  dot.width = dot.height = 32;
  const g = dot.getContext("2d");
  if (g) {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "#fff");
    r.addColorStop(0.5, "rgba(255,255,255,.8)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
  }
  const material = new PointsMaterial({ size: 0.6, map: new CanvasTexture(dot), transparent: true, depthWrite: false, opacity: 0 });
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
