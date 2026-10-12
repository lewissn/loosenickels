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
import { createCottage } from "./cottage";
import { createRain, type Forecast } from "./rain";
import { createMist } from "./mist";
import { createWalk, type WalkState } from "./walk";
import { populate, type Creature, type Env, type Habitat } from "./creatures";
import { createViewer } from "./viewer";
import { START_DAY, dayFraction, describe, simTimeAt, sunRate, sunTime, yearPosition } from "./time";

/* Grows the island into a host element and keeps it running until
   disposed. Everything here is the browser's own work: no network, no
   storage, nothing to sign in to. */

export interface IslandOptions {
  /** Grows a different island. */
  seed: number;
  /** Where the clock starts, in days from midnight on the first of spring. */
  startDay: number;
  /** How fast the clock runs. 1 is a two-minute day; 0 holds it still. */
  speed: number;
  /** Overrides the weather's schedule, for looking at it. */
  weather?: Forecast;
}

export interface IslandEvents {
  onWhen(text: string): void;
  onFollow(label: string | null): void;
  onInteract(): void;
  /** Whether you can take a walk, are on one, and could sit. */
  onWalk(state: WalkState): void;
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
  const cottage = createCottage(scene, world, shared);
  const mist = createMist(scene, detail, shared, terrain.groundMap);
  const falling = createFalling(scene, detail);
  const fireflies = createFireflies(scene, world, detail);

  const hitboxes: Mesh[] = [];
  const viewer = createViewer(renderer.domElement, detail, hitboxes, {
    onInteract: events.onInteract,
    onFollow: (c: Creature | null) => events.onFollow(c ? c.label() : null),
  });
  const habitat: Habitat = { scene, world, camera: viewer.camera, season, hitboxes, shared, people: [] };
  const walk = createWalk(world, viewer.camera, cottage.spots, { pines: vegetation.trees.pine, broadleaves: [...vegetation.trees.dec, ...vegetation.trees.cherry], rocks: vegetation.rocks, leaves: () => season.leafAmt }, events.onWalk, (f) => viewer.zoom(f));
  const creatures = populate(habitat, vegetation.trees.dec[0] ?? vegetation.trees.pine[0], cottage.spots, (h) => walk.attach(h));

  const post = createPost(renderer, scene, viewer.camera, detail, shared);
  const rain = createRain(scene, world, detail, shared, viewer.camera, viewer.controls.target, options.weather);

  // For looking at things while developing: the camera, controls, renderer
  // and everything tappable, from the browser console. Never in production.
  if (process.env.NODE_ENV === "development") {
    (window as unknown as Record<string, unknown>).island = { world, shared, creatures, tick: (ms: number) => tick(ms), camera: viewer.camera, controls: viewer.controls, hitboxes, scene, renderer, post };
  }

  const env: Env = { elev: 0 };
  const timer = new Timer();
  let simT = simTimeAt(options.startDay);
  let hudTimer = 0;

  const tick = (time: number) => {
    timer.update(time);
    // Never backwards (which would turn every easing inside out), never a leap.
    const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1), t = timer.getElapsed();
    simT += dt * options.speed;

    season.blend(yearPosition(simT));
    const weather = rain.update(simT, dt);
    shared.uTime.value = t;
    shared.uGrass.value.copy(season.grass);
    shared.uMeadow.value.copy(season.grass).offsetHSL(0.02, 0.05, 0.07);
    shared.uSnow.value = season.snow;
    shared.uSnowLine.value = 33 - season.snow * 31;
    vegetation.update(season);
    // The hour as the sun sees it, which everything that follows the day reads.
    const sun = sunTime(dayFraction(simT));
    env.elev = sky.update(sun, season);
    cottage.update(sun, t);
    const misty = mist(sun, yearPosition(simT));

    falling(dt, t, season);
    fireflies(t, season, env.elev);
    clouds(dt);
    const walked = walk.update(dt);
    if (walked === "stopped") viewer.ride(null);
    else if (walked === "switched") viewer.ride(walk.rider, true);
    creatures.update(dt, t, env, sun, sunRate(dayFraction(simT)) * options.speed);
    viewer.update(dt, world);

    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.5;
      const sky = weather.storm ? " · thunderstorm" : weather.rain > 0.6 ? " · rain" : weather.rain > 0.15 ? " · showers" : misty > 0.4 ? " · mist" : "";
      events.onWhen(describe(simT) + sky);
    }
    if (post.enabled) post.render(); else renderer.render(scene, viewer.camera);
  };
  renderer.setAnimationLoop(tick);

  const resize = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    post.resize(w, h);
    viewer.resize(w, h);
  });
  resize.observe(host);

  const handle = {
    dispose,
    /** Taking a walk as either of the couple from the cottage. */
    walk: {
      start(as: "him" | "her") {
        const switching = walk.active;
        if (walk.start(as)) viewer.ride(walk.rider, switching);
      },
      stop() { walk.stop(); viewer.ride(null); },
      stick: (x: number, y: number) => walk.stick(x, y),
      sit: () => walk.sit(),
    },
  };
  return handle;

  function dispose() {
    renderer.setAnimationLoop(null);
    resize.disconnect();
    viewer.dispose();
    creatures.dispose();
    walk.dispose();
    timer.dispose();
    post.dispose();
    terrain.heightMap.dispose();
    terrain.groundMap.dispose();
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
  }
}
