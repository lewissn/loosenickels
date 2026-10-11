import { Vector3, type Object3D } from "three";
import { addHitbox, type Creature, type Env, type Habitat } from "./habitat";
import type { RabbitBody, RabbitMood } from "./bodies";
import type { Rig } from "./models";

/* Deer and rabbits: graze, wander to a point they can reach without
   crossing water, flee from a camera that comes too close. Deer lie down
   to sleep at night. */

type State = "graze" | "walk" | "flee" | "sleep";

export const angleTo = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export function randomLandPoint(habitat: Habitat): [number, number] {
  const { isLand, height } = habitat.world;
  for (let i = 0; i < 500; i++) {
    const x = (Math.random() * 2 - 1) * 70, z = (Math.random() * 2 - 1) * 70;
    if (isLand(x, z) && height(x, z) < 12) return [x, z];
  }
  return [0, 0];
}

abstract class Walker implements Creature {
  abstract kind: "deer" | "rabbit";
  x: number;
  z: number;
  tx = 0;
  tz = 0;
  heading = Math.random() * Math.PI * 2;
  state: State = "graze";
  timer = Math.random() * 6;
  phase = Math.random() * 6;
  move = 0;
  private focusV = new Vector3();

  constructor(
    protected habitat: Habitat,
    readonly root: Object3D,
    private walkSpeed: number,
    private runSpeed: number,
    /** How close the camera may come before this animal bolts. */
    private shyness: number,
    private eyeHeight: number,
  ) {
    [this.x, this.z] = randomLandPoint(habitat);
    habitat.scene.add(root);
  }

  abstract label(): string;
  protected abstract pose(dt: number, t: number): void;

  focus() {
    return this.focusV.set(this.x, this.habitat.world.height(this.x, this.z) + this.eyeHeight, this.z);
  }

  protected abstract wanderDistance(): number;
  protected abstract restTime(): number;

  /** Run from something at (x, z), if there is anywhere to run to. */
  startle(x: number, z: number) {
    if (this.state !== "flee" && this.pickTarget(x, z)) this.state = "flee";
  }

  private pickTarget(awayX?: number, awayZ?: number) {
    for (let i = 0; i < 30; i++) {
      let a = Math.random() * Math.PI * 2, d = this.wanderDistance();
      if (awayX !== undefined && awayZ !== undefined) {
        a = Math.atan2(this.z - awayZ, this.x - awayX) + (Math.random() - 0.5) * 1.2;
        d = 12 + Math.random() * 10;
      }
      const tx = this.x + Math.cos(a) * d, tz = this.z + Math.sin(a) * d;
      if (this.habitat.world.clearPath(this.x, this.z, tx, tz)) { this.tx = tx; this.tz = tz; return true; }
    }
    return false;
  }

  update(dt: number, t: number, env: Env) {
    const { camera, world } = this.habitat;
    const night = env.elev < -0.1;
    if (this.kind === "deer" && night && this.state !== "sleep" && this.state !== "flee") this.state = "sleep";
    if (this.state === "sleep" && !night) { this.state = "graze"; this.timer = 1 + Math.random() * 3; }

    const near = camera.position.distanceTo(this.focus());
    if (near < this.shyness) this.startle(camera.position.x, camera.position.z);

    if (this.state === "graze") {
      this.timer -= dt;
      if (this.timer <= 0) { if (this.pickTarget()) this.state = "walk"; else this.timer = 2; }
    } else if (this.state === "walk" || this.state === "flee") {
      const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
      if (d < 0.6) { this.state = "graze"; this.timer = this.restTime(); }
      else {
        this.heading += angleTo(this.heading, Math.atan2(-dz, dx)) * Math.min(1, dt * 5);
        const sp = this.state === "flee" ? this.runSpeed : this.walkSpeed;
        const nx = this.x + Math.cos(this.heading) * sp * dt, nz = this.z - Math.sin(this.heading) * sp * dt;
        if (world.height(nx, nz) > 0.5) { this.x = nx; this.z = nz; }
        else { this.state = "graze"; this.timer = 0.5; }
      }
    }
    const moving = this.state === "walk" || this.state === "flee";
    this.move += ((moving ? 1 : 0) - this.move) * Math.min(1, dt * 6);
    // Hops a second: about two at a walk, three in flight.
    this.phase += dt * Math.PI * 2 * (this.state === "flee" ? 3.1 : 2.1);
    this.root.position.set(this.x, world.height(this.x, this.z), this.z);
    this.root.rotation.y = this.heading;
    this.pose(dt, t);
  }
}

/** Deer and stags, played by their models' own animations. */
export class Deer extends Walker {
  kind = "deer" as const;
  private shown: State | null = null;
  constructor(habitat: Habitat, private rig: Rig, private stag: boolean) {
    super(habitat, rig.root, 2.6, 8, 6, 2);
    addHitbox(habitat, rig.root, 2.6, 1.8, this);
  }
  label() { return this.stag ? "a stag" : "a deer"; }
  wanderDistance() { return 10 + Math.random() * 22; }
  restTime() { return 3 + Math.random() * 8; }
  pose(dt: number) {
    const s = this.state;
    if (s !== this.shown) {
      // Grazing is mostly eating, sometimes standing to look about.
      if (s === "graze") this.rig.play(Math.random() < 0.7 ? "Eating" : Math.random() < 0.5 ? "Idle" : "Idle_2");
      // There is no lying-down animation: at night they rest, heads low.
      else if (s === "sleep") this.rig.play("Idle_Headlow", 0.35, 1.2);
      else if (s === "walk") this.rig.play("Walk", 1.1);
      else this.rig.play("Gallop", 1.05, 0.25);
      this.shown = s;
    }
    this.rig.update(dt);
  }
}

/** Rabbits hop, nibble, and sit up to look when something comes near. */
export class Rabbit extends Walker {
  kind = "rabbit" as const;
  constructor(habitat: Habitat, private body: RabbitBody) {
    super(habitat, body.root, 3.2, 9, 10, 0.8);
    addHitbox(habitat, body.root, 1.6, 0.5, this);
  }
  label() { return this.habitat.season.snow > 0.5 ? "a hare in its winter coat" : "a rabbit"; }
  wanderDistance() { return 5 + Math.random() * 12; }
  restTime() { return 1 + Math.random() * 4; }
  pose(dt: number, t: number) {
    const hop = (this.phase / (Math.PI * 2)) % 1;
    // Something not quite close enough to bolt from is worth sitting up for.
    const near = this.habitat.camera.position.distanceTo(this.focus());
    const mood: RabbitMood = this.state === "flee" ? "flee" : this.state === "walk" ? "hop" : near < 22 ? "alert" : "graze";
    this.body.pose(dt, t, hop, this.move, mood);
  }
}
