import { ACESFilmicToneMapping, Mesh, PCFShadowMap, Scene, Timer, WebGLRenderer, type Material, type Object3D } from "three";
import { createShared } from "./shared";
import { createPost } from "./post";
import { detectDetail } from "./detail";
import { createWorld } from "./world";
import { Season } from "./seasons";
import { createTerrain } from "./terrain";
import { createWater } from "./water";
import { createVegetation } from "./vegetation";
import { createSky } from "./sky";
import { createClouds, createFalling } from "./weather";
import { createFireflies } from "./fireflies";
import { createGrass } from "./grass";
import { populate, type Creature, type Env, type Habitat } from "./creatures";
import { createViewer } from "./viewer";
import { DAY, START_DAY, dayFraction, describe, yearPosition } from "./time";

/* Grows the island into a host element and keeps it running until
   disposed. Everything here is the browser's own work: no network, no
   storage, nothing to sign in to. */

export interface IslandOptions {
  /** Grows a different island. */
  seed: number;
  /** Where the clock starts, in days from midnight on the first of spring. */
  startDay: number;
  /** How fast the clock runs. 1 is a 48-second day; 0 holds it still. */
  speed: number;
}

export interface IslandEvents {
  onWhen(text: string): void;
  onFollow(label: string | null): void;
  onInteract(): void;
}

export const DEFAULT_OPTIONS: IslandOptions = { seed: 1187, startDay: START_DAY, speed: 1 };

export function startIsland(host: HTMLElement, options: IslandOptions, events: IslandEvents) {
  const detail = detectDetail();
  const world = createWorld(options.seed);

  // Antialiasing happens in the post-processing chain's own target.
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(detail.pixelRatio);
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const season = new Season();
  const shared = createShared();
  const sky = createSky(scene, detail, shared);
  const terrain = createTerrain(world, detail, shared);
  scene.add(terrain.mesh);
  createWater(scene, detail, shared, terrain.heightMap);
  // Seeded draws happen in a fixed order — trees, rocks, flowers, clouds —
  // so the same seed always grows the same island.
  const vegetation = createVegetation(scene, world, detail, shared);
  const clouds = createClouds(scene, world.rand, shared);
  createGrass(scene, world, detail, shared);
  const falling = createFalling(scene, detail);
  const fireflies = createFireflies(scene, world, detail);

  const hitboxes: Mesh[] = [];
  const viewer = createViewer(renderer.domElement, detail, hitboxes, {
    onInteract: events.onInteract,
    onFollow: (c: Creature | null) => events.onFollow(c ? c.label() : null),
  });
  const habitat: Habitat = { scene, world, camera: viewer.camera, season, hitboxes };
  const creatures = populate(habitat, vegetation.trees.dec[0] ?? vegetation.trees.pine[0]);

  const post = createPost(renderer, scene, viewer.camera, detail, shared);

  // For looking at things while developing: the camera, controls, renderer
  // and everything tappable, from the browser console. Never in production.
  if (process.env.NODE_ENV === "development") {
    (window as unknown as Record<string, unknown>).island = { world, camera: viewer.camera, controls: viewer.controls, hitboxes, scene, renderer, post };
  }

  const env: Env = { elev: 0 };
  const timer = new Timer();
  let simT = DAY * options.startDay;
  let hudTimer = 0;

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1), t = timer.getElapsed();
    simT += dt * options.speed;

    season.blend(yearPosition(simT));
    shared.uTime.value = t;
    shared.uGrass.value.copy(season.grass);
    shared.uMeadow.value.copy(season.grass).offsetHSL(0.02, 0.05, 0.07);
    shared.uSnow.value = season.snow;
    shared.uSnowLine.value = 33 - season.snow * 31;
    vegetation.update(season);
    env.elev = sky.update(dayFraction(simT), season);

    falling(dt, t, season);
    fireflies(t, season, env.elev);
    clouds(dt);
    creatures.update(dt, t, env);
    viewer.update(dt, world);

    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.5; events.onWhen(describe(simT)); }
    if (post.enabled) post.render(); else renderer.render(scene, viewer.camera);
  });

  const resize = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    post.resize(w, h);
    viewer.resize(w, h);
  });
  resize.observe(host);

  return function dispose() {
    renderer.setAnimationLoop(null);
    resize.disconnect();
    viewer.dispose();
    creatures.dispose();
    timer.dispose();
    post.dispose();
    terrain.heightMap.dispose();
    scene.traverse((o: Object3D) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const materials: Material[] = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) value.dispose();
        material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
