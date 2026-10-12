import { Vector3, type Camera } from "three";
import type { CottageSpots } from "./cottage";
import type { Household } from "./creatures/household";
import type { Placed } from "./vegetation";
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
  obstacles: { trees: Placed[]; rocks: Placed[] },
  onChange: (state: WalkState) => void,
) {
  // Trunks and boulders as circles, bucketed so each step checks only a few.
  const grid = new Map<string, { x: number; z: number; r: number }[]>();
  const add = (x: number, z: number, r: number) => {
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push({ x, z, r });
  };
  for (const t of obstacles.trees) add(t.x, t.z, 0.45 * t.s);
  for (const r of obstacles.rocks) add(r.x, r.z, 0.85 * r.s * Math.max(r.sx ?? 1, r.sz ?? 1));

  const blocked = (x: number, z: number) => {
    if (world.height(x, z) < -0.35) return true; // too deep to wade
    if (world.normalY(x, z) < 0.55) return true; // too steep to climb
    if (spots.blocks(x, z)) return true;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const o of grid.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(x - o.x, z - o.z) < o.r + 0.3) return true;
    }
    return false;
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
    solid: (x, y, z) => spots.solid(x, y, z),
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
