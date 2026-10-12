import { Vector3 } from "three";
import { addHitbox, type Creature, type Env, type Habitat } from "./habitat";
import { angleTo, randomLandPoint } from "./walker";
import type { BearBody, BearPose } from "./bodies";
import type { Placed } from "../vegetation";

/* A brown bear, up in the pinewoods, well away from the cottage.

   By day it ambles about its patch of the woods, nose to the ground,
   foraging; now and then it sits back on its haunches for a while, or rears
   up on its hind legs to sniff the air. It wants nothing to do with anyone:
   the camera, the couple or the dog coming close sends it lumbering off —
   though a dog gets a rear-up first. At night it goes back to its den to
   sleep, and through the winter it sleeps there all day too. */

type State = "sleep" | "amble" | "forage" | "sit" | "rear" | "leave" | "home";

const AMBLE = 1.25, LEAVE = 3.4;
const RANGE = 18;    // how far it strays from its den
const SHYNESS = 13;  // how close anything may come

export class Bear implements Creature {
  kind = "bear" as const;
  x: number;
  z: number;
  heading = Math.random() * Math.PI * 2;
  state: State = "sleep";
  readonly position = new Vector3();
  private den: [number, number];
  private tx = 0;
  private tz = 0;
  private timer = 0;
  private move = 0;
  private reared = 0;
  private focusV = new Vector3();
  private dog: { position: Vector3; outside: boolean } | null = null;

  constructor(private habitat: Habitat, private body: BearBody, pines: Placed[]) {
    this.den = findDen(habitat, pines);
    [this.x, this.z] = this.den;
    this.tx = this.x;
    this.tz = this.z;
    habitat.scene.add(body.root);
    addHitbox(habitat, body.root, 2.2, 0.9, this);
  }

  /** The dog, which it rears up at before going. */
  watch(dog: { position: Vector3; outside: boolean }) { this.dog = dog; }

  /** Asleep (or hibernating), it doesn't trouble anyone. */
  get outside() { return this.state !== "sleep"; }
  private get hibernating() { return this.habitat.season.snow > 0.5; }

  label() {
    if (this.state !== "sleep") return "a bear";
    return this.hibernating ? "a bear, hibernating" : "a bear, asleep";
  }

  focus() {
    const sitting = this.state === "sit" || this.state === "rear";
    return this.focusV.set(this.x, this.habitat.world.height(this.x, this.z) + (sitting ? 1.5 : 1.0), this.z);
  }

  private wanderTo() {
    const { clearPath } = this.habitat.world;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * RANGE;
      const tx = this.den[0] + Math.cos(a) * d, tz = this.den[1] + Math.sin(a) * d;
      if (Math.hypot(tx - this.x, tz - this.z) > 4 && clearPath(this.x, this.z, tx, tz)) { this.tx = tx; this.tz = tz; return true; }
    }
    return false;
  }

  private leaveFrom(x: number, z: number) {
    const { clearPath } = this.habitat.world;
    for (let i = 0; i < 20; i++) {
      const a = Math.atan2(this.z - z, this.x - x) + (Math.random() - 0.5) * 1.4, d = 12 + Math.random() * 8;
      const tx = this.x + Math.cos(a) * d, tz = this.z + Math.sin(a) * d;
      if (clearPath(this.x, this.z, tx, tz)) { this.tx = tx; this.tz = tz; return true; }
    }
    return false;
  }

  /** Steps towards (tx, tz). Returns the distance left, or -1 if the way is blocked. */
  private step(dt: number, speed: number) {
    const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.8) return d;
    this.heading += angleTo(this.heading, Math.atan2(-dz, dx)) * Math.min(1, dt * 2.5);
    const nx = this.x + Math.cos(this.heading) * speed * dt, nz = this.z - Math.sin(this.heading) * speed * dt;
    if (this.habitat.world.height(nx, nz) <= 0.5) return -1;
    this.x = nx;
    this.z = nz;
    return d;
  }

  private settle(state: "forage" | "sit" | "rear", seconds: number) {
    this.state = state;
    this.timer = seconds;
  }

  update(dt: number, t: number, env: Env) {
    const { camera, world } = this.habitat;
    const bedtime = env.elev < -0.05 || this.hibernating;
    this.reared -= dt;

    if (this.state === "sleep") {
      if (!bedtime) { this.state = "amble"; this.timer = 0; this.wanderTo(); }
    } else {
      // Anything coming too close: off it goes (a dog gets reared at first).
      const close = (p: Vector3) => Math.hypot(p.x - this.x, p.z - this.z) < SHYNESS;
      let from: Vector3 | null = close(camera.position) ? camera.position : null;
      for (const p of this.habitat.people) if (p !== this && p.outside && close(p.position)) from = p.position;
      if (from && this.state !== "leave" && this.state !== "rear") {
        const dog = this.dog && this.dog.outside && from === this.dog.position;
        if (dog && this.reared <= 0) { this.settle("rear", 2.2); this.reared = 20; }
        else if (this.leaveFrom(from.x, from.z)) this.state = "leave";
      }
      if (bedtime && this.state !== "leave" && this.state !== "home") {
        this.state = "home";
        [this.tx, this.tz] = this.den;
      }

      switch (this.state) {
        case "amble": {
          const d = this.step(dt, AMBLE);
          if (d < 0.8) {
            // Arrived: mostly a forage, sometimes a sit, now and then a look about on its hind legs.
            const r = Math.random();
            if (r < 0.6) this.settle("forage", 6 + Math.random() * 10);
            else if (r < 0.85) this.settle("sit", 6 + Math.random() * 8);
            else this.settle("rear", 2.5 + Math.random() * 1.5);
          } else if (d < 0) this.settle("forage", 3);
          break;
        }
        case "forage":
        case "sit":
        case "rear":
          this.timer -= dt;
          if (this.timer <= 0) {
            // Up on its hind legs over a dog, it comes down and goes.
            if (this.state === "rear" && this.dog?.outside && Math.hypot(this.dog.position.x - this.x, this.dog.position.z - this.z) < SHYNESS && this.leaveFrom(this.dog.position.x, this.dog.position.z)) this.state = "leave";
            else if (this.wanderTo()) this.state = "amble";
            else this.timer = 2;
          }
          break;
        case "leave": {
          const d = this.step(dt, LEAVE);
          if (d < 0.8) this.settle("sit", 4 + Math.random() * 4);
          else if (d < 0) this.settle("forage", 2);
          break;
        }
        case "home": {
          const d = this.step(dt, AMBLE * 1.3);
          if (d < 0.8) this.state = "sleep";
          // A blocked way home: it beds down where it is.
          else if (d < 0) { this.den = [this.x, this.z]; this.state = "sleep"; }
          break;
        }
      }
    }

    const walking = this.state === "amble" || this.state === "leave" || this.state === "home";
    this.move += ((walking ? 1 : 0) - this.move) * Math.min(1, dt * 4);
    const pose: BearPose = walking ? "walk" : this.state === "forage" ? "forage" : this.state === "sit" ? "sit" : this.state === "rear" ? "rear" : "sleep";
    this.body.root.position.set(this.x, world.height(this.x, this.z), this.z);
    this.body.root.rotation.y = this.heading;
    this.position.copy(this.body.root.position);
    this.body.pose(dt, t, pose, this.move, this.state === "leave" ? LEAVE / AMBLE * 0.75 : 1);
  }
}

/**
 * A den among the pines, well away from the cottage: the pine with the
 * most others round it, on ground a bear could walk from.
 */
function findDen(habitat: Habitat, pines: Placed[]): [number, number] {
  const { world } = habitat;
  let best: [number, number] | null = null, bestCount = 0;
  for (const p of pines) {
    if (world.nearSite(p.x, p.z, 38)) continue;
    // Beside the tree rather than in it.
    const x = p.x + 1.6, z = p.z + 1.2;
    if (!world.isLand(x, z)) continue;
    let n = 0;
    for (const q of pines) if (Math.hypot(q.x - p.x, q.z - p.z) < 14) n++;
    if (n > bestCount) { bestCount = n; best = [x, z]; }
  }
  if (best) return best;
  for (let i = 0; i < 50; i++) {
    const at = randomLandPoint(habitat);
    if (!world.nearSite(at[0], at[1], 38)) return at;
  }
  return randomLandPoint(habitat);
}
