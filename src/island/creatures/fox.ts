import { Vector3 } from "three";
import { addHitbox, type Creature, type Env, type Habitat } from "./habitat";
import { angleTo, randomLandPoint, type Rabbit } from "./walker";
import type { Rig } from "./models";

/* A fox that dozes the day away at its den and hunts rabbits at night.

   After dark it trots between points, pausing to look about. A rabbit
   within sight is stalked, low and slow, until the fox is close enough to
   rush it. The rabbit always gets away — the island is something to watch
   for hours, and its rabbits are not a dwindling supply — so the chase ends
   with the fox giving up, sitting a while, and then going on. Towards dawn
   it goes home. Like everything else, it keeps its distance from the
   camera. */

type State = "den" | "prowl" | "pause" | "stalk" | "chase" | "rest" | "home" | "flee";

const SIGHT = 22;          // how far off a rabbit is noticed
const POUNCE = 7;          // how close the stalk gets before the rush
const GIVE_UP_AFTER = 3.5; // seconds of chasing
const LOST_AT = 16;        // a rabbit this far ahead has got away
const SHYNESS = 8;         // how close the camera may come
const SPEED: Record<State, number> = { den: 0, prowl: 3.4, pause: 0, stalk: 1.5, chase: 10, rest: 0, home: 3.4, flee: 9 };

export class Fox implements Creature {
  kind = "fox" as const;
  private x: number;
  private z: number;
  private den: [number, number];
  private tx = 0;
  private tz = 0;
  private heading = Math.random() * Math.PI * 2;
  private state: State = "den";
  private timer = 0;
  private cooldown = 0;
  private prey: Rabbit | null = null;
  private focusV = new Vector3();

  private shown: State | null = null;

  constructor(private habitat: Habitat, private rig: Rig, private rabbits: Rabbit[]) {
    this.den = randomLandPoint(habitat);
    [this.x, this.z] = this.den;
    habitat.scene.add(rig.root);
    addHitbox(habitat, rig.root, 1.8, 0.7, this);
  }

  label() { return this.state === "den" ? "a fox, asleep" : "a fox"; }

  focus() {
    return this.focusV.set(this.x, this.habitat.world.height(this.x, this.z) + 0.8, this.z);
  }

  private wanderTo() {
    const { clearPath } = this.habitat.world;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 18;
      const tx = this.x + Math.cos(a) * d, tz = this.z + Math.sin(a) * d;
      if (clearPath(this.x, this.z, tx, tz)) { this.tx = tx; this.tz = tz; return true; }
    }
    return false;
  }

  private fleeFrom(x: number, z: number) {
    const { clearPath } = this.habitat.world;
    for (let i = 0; i < 20; i++) {
      const a = Math.atan2(this.z - z, this.x - x) + (Math.random() - 0.5) * 1.2, d = 14 + Math.random() * 8;
      const tx = this.x + Math.cos(a) * d, tz = this.z + Math.sin(a) * d;
      if (clearPath(this.x, this.z, tx, tz)) { this.tx = tx; this.tz = tz; return true; }
    }
    return false;
  }

  private spotRabbit() {
    let best: Rabbit | null = null, bestD = SIGHT;
    for (const r of this.rabbits) {
      const d = Math.hypot(r.x - this.x, r.z - this.z);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best;
  }

  private settle(state: "pause" | "rest", seconds: number) {
    this.state = state;
    this.timer = seconds;
    this.prey = null;
  }

  /** Steps towards (tx, tz). Returns the distance left, or -1 if the way is blocked. */
  private step(dt: number) {
    const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.6) return d;
    this.heading += angleTo(this.heading, Math.atan2(-dz, dx)) * Math.min(1, dt * 6);
    const sp = SPEED[this.state];
    const nx = this.x + Math.cos(this.heading) * sp * dt, nz = this.z - Math.sin(this.heading) * sp * dt;
    if (this.habitat.world.height(nx, nz) <= 0.5) return -1;
    this.x = nx;
    this.z = nz;
    return d;
  }

  update(dt: number, env: Env) {
    const { camera, world } = this.habitat;
    const night = env.elev < -0.06;
    this.cooldown -= dt;

    if (this.state !== "den" && this.state !== "flee" && camera.position.distanceTo(this.focus()) < SHYNESS && this.fleeFrom(camera.position.x, camera.position.z)) {
      this.state = "flee";
      this.prey = null;
    }
    for (const p of this.habitat.people) {
      if (p.outside && this.state !== "den" && this.state !== "flee" && Math.hypot(p.position.x - this.x, p.position.z - this.z) < SHYNESS && this.fleeFrom(p.position.x, p.position.z)) {
        this.state = "flee";
        this.prey = null;
      }
    }
    if (!night && this.state !== "den" && this.state !== "home" && this.state !== "flee") {
      this.state = "home";
      this.prey = null;
      [this.tx, this.tz] = this.den;
    }
    if (night && this.state === "den") this.settle("pause", 1 + Math.random() * 3);

    switch (this.state) {
      case "pause":
      case "rest":
        this.timer -= dt;
        if (this.cooldown <= 0) {
          const r = this.spotRabbit();
          if (r) { this.prey = r; this.state = "stalk"; break; }
        }
        if (this.timer <= 0) { if (this.wanderTo()) this.state = "prowl"; else this.timer = 2; }
        break;
      case "prowl": {
        if (this.cooldown <= 0) {
          const r = this.spotRabbit();
          if (r) { this.prey = r; this.state = "stalk"; break; }
        }
        const d = this.step(dt);
        if (d < 0.6) this.settle("pause", 1 + Math.random() * 4);
        break;
      }
      case "stalk": {
        const prey = this.prey!;
        this.tx = prey.x; this.tz = prey.z;
        const gap = Math.hypot(prey.x - this.x, prey.z - this.z);
        if (gap > SIGHT * 1.2) { this.settle("pause", 1); break; }
        if (gap < POUNCE || prey.state === "flee") {
          this.state = "chase";
          this.timer = GIVE_UP_AFTER;
          prey.startle(this.x, this.z);
          break;
        }
        if (this.step(dt) < 0) this.settle("pause", 1);
        break;
      }
      case "chase": {
        const prey = this.prey!;
        this.tx = prey.x; this.tz = prey.z;
        this.timer -= dt;
        const gap = Math.hypot(prey.x - this.x, prey.z - this.z);
        if (gap < POUNCE) prey.startle(this.x, this.z);
        // It got away: out of reach, out of time, or into cover the fox can't follow.
        if (this.timer <= 0 || gap > LOST_AT || gap < 1.2 || this.step(dt) < 0) {
          this.settle("rest", 3 + Math.random() * 3);
          this.cooldown = 8 + Math.random() * 6;
        }
        break;
      }
      case "flee": {
        const d = this.step(dt);
        if (d < 0.6 || d < 0) {
          if (night) this.settle("pause", 1 + Math.random() * 2);
          else { this.state = "home"; [this.tx, this.tz] = this.den; }
        }
        break;
      }
      case "home": {
        const d = this.step(dt);
        // A blocked way home: the fox makes do where it is.
        if (d < 0.6) this.state = "den";
        else if (d < 0) this.den = [this.x, this.z];
        break;
      }
    }

    this.rig.root.position.set(this.x, world.height(this.x, this.z), this.z);
    this.rig.root.rotation.y = this.heading;
    this.pose(dt);
  }

  private pose(dt: number) {
    const s = this.state;
    if (s !== this.shown) {
      if (s === "den") this.rig.play("Idle_2_HeadLow", 0.3, 1.2);
      else if (s === "prowl" || s === "home") this.rig.play("Walk", 1.15);
      else if (s === "stalk") this.rig.play("Walk", 0.45, 0.6);
      // The rush begins with a pounce.
      else if (s === "chase") this.rig.once("Gallop_Jump", "Gallop", 1.1);
      else if (s === "flee") this.rig.play("Gallop", 1.1, 0.25);
      else if (s === "rest") this.rig.play("Idle_2", 1, 0.5);
      else this.rig.play(Math.random() < 0.5 ? "Idle" : "Idle_2", 1, 0.5);
      this.shown = s;
    }
    this.rig.update(dt);
  }
}
