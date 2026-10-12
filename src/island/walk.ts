import { Vector3, type Camera } from "three";
import type { CottageSpots } from "./cottage";
import type { Household } from "./creatures/household";
import { CANOPY_AT, type Placed } from "./vegetation";
import type { Rider } from "./viewer";
import type { World } from "./world";

/* Taking a walk as the man from the cottage.

   Keys (WASD or arrows, Shift to run) or a thumbstick on a phone move him
   relative to the camera, which rides behind him. He walks round trees,
   rocks and the house, can wade into the shallows but no further, and
   can't scale a cliff. Beside the bench he can sit down; any step stands
   him up again. While you have him, his wife carries on with her day, and
   when you stop he goes back to his. */

const WALK = 2.0, RUN = 5.0, ACCEL = 10;
const CELL = 4;

export interface WalkState {
  /** Whether there's anyone to walk yet (the models load after the island). */
  ready: boolean;
  active: boolean;
  /** Whether he's by the bench and could sit. */
  canSit: boolean;
  sitting: boolean;
}

export function createWalk(
  world: World,
  camera: Camera,
  spots: CottageSpots,
  obstacles: { pines: Placed[]; broadleaves: Placed[]; rocks: Placed[]; leaves: () => number },
  onChange: (state: WalkState) => void,
  zoom: (factor: number) => void,
) {
  // Trunks and boulders as circles, bucketed so each step checks only a few.
  // Each also knows its shape above the ground, for keeping the camera out
  // of canopies: a ball of leaves, or a pine's narrowing cone.
  type Obstacle = { x: number; z: number; r: number; y: number; s: number; crown: "broad" | "pine" | "none" };
  const grid = new Map<string, Obstacle[]>();
  const add = (o: Obstacle) => {
    const key = `${Math.floor(o.x / CELL)},${Math.floor(o.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(o);
  };
  for (const t of obstacles.pines) add({ x: t.x, z: t.z, r: 0.45 * t.s, y: t.y, s: t.s, crown: "pine" });
  for (const t of obstacles.broadleaves) add({ x: t.x, z: t.z, r: 0.45 * t.s, y: t.y, s: t.s, crown: "broad" });
  for (const r of obstacles.rocks) add({ x: r.x, z: r.z, r: 0.85 * r.s * Math.max(r.sx ?? 1, r.sz ?? 1), y: r.y, s: r.s, crown: "none" });
  const near = (x: number, z: number, reach: number, visit: (o: Obstacle) => boolean) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), n = Math.ceil(reach / CELL);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      for (const o of grid.get(`${cx + i},${cz + j}`) ?? []) if (visit(o)) return true;
    }
    return false;
  };

  /** Whether the camera at (x, y, z) would be inside a tree or a rock. */
  const inGreenery = (x: number, y: number, z: number) => near(x, z, 3, (o) => {
    const d = Math.hypot(x - o.x, z - o.z), h = y - o.y;
    if (h < 0) return false;
    // Bare in winter, a broadleaf is only its trunk and limbs.
    if (o.crown === "broad") return (h < CANOPY_AT * o.s && d < o.r) || Math.hypot(d, h - CANOPY_AT * o.s) < 2.1 * o.s * obstacles.leaves();
    if (o.crown === "pine") return h < 7 * o.s && d < Math.max(o.r, 1.9 * o.s * (1 - Math.max(0, h - 0.8 * o.s) / (6.4 * o.s)));
    return d < o.r && h < o.r * 1.2;
  });

  const blocked = (x: number, z: number) => {
    if (world.height(x, z) < -0.35) return true; // too deep to wade
    if (world.normalY(x, z) < 0.55) return true; // too steep to climb
    if (spots.blocks(x, z)) return true;
    return near(x, z, 1, (o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.3);
  };

  // ---- input
  const keys = new Set<string>();
  const stick = { x: 0, y: 0 };
  let sitRequested = false, stopRequested = false;
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (!active) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
      e.preventDefault();
      if (down) keys.add(k); else keys.delete(k);
    }
    if (down && k === "e") sitRequested = true;
    // Zoom in and out, as in Roblox.
    if (down && k === "i") zoom(0.8);
    if (down && k === "o") zoom(1.25);
    if (down && k === "escape") stopRequested = true;
  };
  const keyDown = onKey(true), keyUp = onKey(false);
  const blur = () => keys.clear();
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);

  let household: Household | null = null;
  let active = false, speed = 0, heading = 0, last: WalkState | null = null;
  const fwd = new Vector3(), right = new Vector3(), want = new Vector3();

  const rider: Rider = {
    focus: () => household!.him.focus(),
    heading: () => heading,
    moving: () => speed > 0.3,
    // The camera mustn't end up inside the house.
    solid: (x, y, z) => spots.solid(x, y, z) || inGreenery(x, y, z),
    show: (visible) => { if (household) household.him.rig.root.visible = visible; },
  };

  function report() {
    const him = household?.him;
    const state: WalkState = {
      ready: !!household,
      active,
      sitting: !!him && active && him.doing === "sit",
      canSit: !!him && active && him.doing !== "sit" && him.distanceTo(spots.bench.at) < 1.8,
    };
    if (!last || Object.keys(state).some((k) => state[k as keyof WalkState] !== last![k as keyof WalkState])) {
      last = state;
      onChange(state);
    }
  }

  return {
    rider,
    get active() { return active; },
    /** Called once the couple have arrived. */
    attach(h: Household) { household = h; report(); },
    start() {
      if (!household || active) return false;
      active = true;
      household.control(true);
      heading = household.him.heading;
      speed = 0;
      report();
      return true;
    },
    stop() {
      if (!household || !active) return;
      active = false;
      keys.clear();
      stick.x = stick.y = 0;
      household.control(false);
      household.him.rig.root.visible = household.him.doing !== "inside";
      report();
    },
    /** The thumbstick, -1 to 1 each way (y up the screen). */
    stick(x: number, y: number) { stick.x = x; stick.y = y; },
    sit() { sitRequested = true; },
    /** Returns true when the walk has just been ended from the keyboard. */
    update(dt: number) {
      if (!household) return false;
      if (stopRequested) { stopRequested = false; if (active) { this.stop(); return true; } }
      if (!active) return false;
      const him = household.him;

      // Which way is "forward": away from the camera, along the ground.
      camera.getWorldDirection(fwd).setY(0);
      // Looking straight down there's no "away along the ground": use his facing.
      if (fwd.lengthSq() < 1e-4) fwd.set(Math.cos(heading), 0, -Math.sin(heading));
      fwd.normalize();
      right.set(-fwd.z, 0, fwd.x);
      let mx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      let my = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
      let push = Math.min(1, Math.hypot(mx, my));
      if (Math.hypot(stick.x, stick.y) > 0.08) { mx = stick.x; my = stick.y; push = Math.min(1, Math.hypot(mx, my)); }
      const running = keys.has("shift") || Math.hypot(stick.x, stick.y) > 0.9;
      want.copy(fwd).multiplyScalar(my).addScaledVector(right, mx);

      if (sitRequested) {
        sitRequested = false;
        if (him.distanceTo(spots.bench.at) < 1.8 && him.doing !== "sit") {
          him.sitAt(spots.bench.at, spots.bench.face);
          heading = spots.bench.face;
          speed = 0;
        }
      }
      if (him.doing === "sit" && push > 0.1) him.doing = "potter"; // any step stands him up

      const target = him.doing === "sit" ? 0 : push * (running ? RUN : WALK);
      speed += (target - speed) * Math.min(1, dt * ACCEL);
      if (push > 0.05 && him.doing !== "sit") {
        const h = Math.atan2(-want.z, want.x);
        let turn = (h - heading) % (Math.PI * 2);
        if (turn > Math.PI) turn -= Math.PI * 2;
        if (turn < -Math.PI) turn += Math.PI * 2;
        heading += turn * Math.min(1, dt * 10);
      }
      if (speed > 0.01) {
        const dx = Math.cos(heading) * speed * dt, dz = -Math.sin(heading) * speed * dt;
        // Slide along whatever's in the way rather than stopping dead; and if
        // he's somehow already inside something (up from the bench, say), let
        // him walk out of it.
        if (blocked(him.x, him.z) || !blocked(him.x + dx, him.z + dz)) { him.x += dx; him.z += dz; }
        else if (!blocked(him.x + dx, him.z)) him.x += dx;
        else if (!blocked(him.x, him.z + dz)) him.z += dz;
        else speed *= 0.5;
      }
      him.heading = heading;
      him.speed = speed;
      report();
      return false;
    },
    dispose() {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    },
  };
}
