import { Vector3 } from "three";
import { addHitbox, type Creature, type Env, type Habitat } from "./habitat";
import type { DeerBody, RabbitBody } from "./bodies";

/* Deer and rabbits: graze, wander to a point they can reach without
   crossing water, flee from a camera that comes too close. Deer lie down
   to sleep at night. */

type State = "graze" | "walk" | "flee" | "sleep";

const angleTo = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

function randomLandPoint(habitat: Habitat): [number, number] {
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
    readonly root: DeerBody["root"],
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
    if (this.state !== "flee" && near < this.shyness && this.pickTarget(camera.position.x, camera.position.z)) this.state = "flee";

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
    this.phase += dt * (this.state === "flee" ? this.runSpeed : this.walkSpeed) * (this.kind === "rabbit" ? 1.1 : 2.2);
    this.root.position.set(this.x, world.height(this.x, this.z), this.z);
    this.root.rotation.y = this.heading;
    this.pose(dt, t);
  }
}

export class Deer extends Walker {
  kind = "deer" as const;
  constructor(habitat: Habitat, private parts: DeerBody, private stag: boolean) {
    super(habitat, parts.root, 2.6, 8, 6, 2);
    addHitbox(habitat, parts.root, 2.6, 1.8, this);
  }
  label() { return this.stag ? "a stag" : "a deer"; }
  wanderDistance() { return 10 + Math.random() * 22; }
  restTime() { return 3 + Math.random() * 8; }
  pose(dt: number, t: number) {
    const { neck, body, legs } = this.parts;
    const k = Math.min(1, dt * 4);
    const sleeping = this.state === "sleep";
    const neckT = sleeping ? 0.3 : this.state === "graze" ? -2.1 + Math.sin(t * 1.5 + this.phase) * 0.08 : -0.1;
    neck.rotation.z += (neckT - neck.rotation.z) * k;
    body.position.y += ((sleeping ? -0.85 : 0) - body.position.y) * k * 0.5;
    legs.forEach((leg, i) => {
      const fold = sleeping ? (i < 2 ? 1.45 : -1.45) : Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 * this.move;
      leg.rotation.z += (fold - leg.rotation.z) * Math.min(1, dt * (sleeping ? 2 : 12));
    });
  }
}

export class Rabbit extends Walker {
  kind = "rabbit" as const;
  constructor(habitat: Habitat, private parts: RabbitBody) {
    super(habitat, parts.root, 3.2, 9, 10, 0.8);
    addHitbox(habitat, parts.root, 1.6, 0.5, this);
  }
  label() { return this.habitat.season.snow > 0.5 ? "a hare in its winter coat" : "a rabbit"; }
  wanderDistance() { return 5 + Math.random() * 12; }
  restTime() { return 1 + Math.random() * 4; }
  pose() {
    const { body, head } = this.parts;
    body.position.y = Math.abs(Math.sin(this.phase)) * 0.5 * this.move;
    head.position.y = 0.72 - (this.state === "graze" ? 0.18 : 0);
  }
}
