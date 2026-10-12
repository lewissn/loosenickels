import { Vector3 } from "three";
import { addHitbox, type Creature, type Habitat } from "./habitat";
import { angleTo, type Rabbit } from "./walker";
import { bend, restPose, type Rig } from "./models";
import type { Household } from "./household";
import type { CottageSpots } from "../cottage";

/* The couple's dog, a husky.

   It goes where they go: out of the door with whoever goes out first, in
   again with the last one in. Out, it keeps to heel a little behind and to
   one side of whoever you're walking (or whoever's about), galloping to
   catch up when it's been left behind. When they stop, it potters and
   sniffs about nearby; when they sit on the bench, it lies at their feet.
   Now and then it can't help going after a rabbit — with a leap — and
   comes back, never having caught one. It gives the bear a wide berth. */

type State = "inside" | "heel" | "roam" | "sniff" | "lie" | "chase";

const TROT = 2.6, GALLOP = 6.8;
const UP = new Vector3(0, 1, 0), side = new Vector3();
/** Lying down, as there's no animation for it: how far the body drops, and each leg's fold. */
const LIE = { drop: 0.3, frontUpper: -0.5, frontLower: -1.1, backUpper: -1.6, backLower: 2.4 };

export class Dog implements Creature {
  kind = "dog" as const;
  x: number;
  z: number;
  heading = 0;
  state: State = "inside";
  private tx = 0;
  private tz = 0;
  private timer = 0;
  private still = 0;
  private speed = 0;
  private prey: Rabbit | null = null;
  private detour = 0;
  private lying = 0;
  private legs: ReturnType<typeof restPose>;
  private shown = "";
  private lastLeader = new Vector3();
  private focusV = new Vector3();
  readonly position = new Vector3();
  /** Somewhere to keep clear of: the bear. */
  avoid: Vector3 | null = null;

  private door: Vector3;

  constructor(private habitat: Habitat, private rig: Rig, private household: Household, private rabbits: Rabbit[], private spots: CottageSpots) {
    this.door = spots.door;
    this.x = this.door.x;
    this.z = this.door.z;
    habitat.scene.add(rig.root);
    addHitbox(habitat, rig.root, 1.2, 0.5, this);
    rig.root.visible = false;
    this.legs = restPose(rig, ["FrontUpperLegL", "FrontUpperLegR", "FrontLowerLegL", "FrontLowerLegR", "BackUpperLegL", "BackUpperLegR", "BackLowerLegL", "BackLowerLegR"]);
  }

  label() { return this.state === "lie" ? "the dog, lying down" : "the dog"; }
  focus() { return this.focusV.set(this.x, this.habitat.world.height(this.x, this.z) + 0.6, this.z); }
  get outside() { return this.state !== "inside"; }

  /** Whoever it's with: the one you're walking, else whoever's out. */
  private leader() {
    const [him, her] = this.household.people;
    if (him.controlled && him.outside) return him;
    if (her.controlled && her.outside) return her;
    if (him.outside) return him;
    if (her.outside) return her;
    return null;
  }

  private moveTo(x: number, z: number, speed: number, dt: number) {
    const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { this.speed = 0; return d; }
    const sp = Math.min(speed, d / Math.max(dt, 1e-3));
    // Not into the sea, and round the house and the bench rather than
    // through them: blocked, it bears off to one side (keeping to the same
    // side until it's past) until the way is clear.
    const ok = (h: number) => {
      const x = this.x + Math.cos(h) * 0.5, z = this.z - Math.sin(h) * 0.5;
      return this.habitat.world.height(x, z) > 0.1 && !this.spots.blocks(x, z);
    };
    const want = Math.atan2(-dz, dx);
    let go = want;
    if (ok(want)) this.detour = 0;
    else {
      if (!this.detour) this.detour = Math.random() < 0.5 ? 1 : -1;
      go = NaN;
      for (let i = 1; i <= 6 && Number.isNaN(go); i++) {
        for (const sign of [this.detour, -this.detour]) {
          if (ok(want + sign * i * 0.5)) { go = want + sign * i * 0.5; this.detour = sign; break; }
        }
      }
    }
    if (Number.isNaN(go)) { this.speed = 0; return d; }
    // It turns smoothly, but steps the clear way at once.
    this.heading += angleTo(this.heading, go) * Math.min(1, dt * 7);
    this.x += Math.cos(go) * sp * dt;
    this.z -= Math.sin(go) * sp * dt;
    this.speed = sp;
    return d;
  }

  update(dt: number) {
    const { world } = this.habitat;
    const L = this.leader();

    if (!L) {
      // Everyone's in: in it goes too.
      if (this.state !== "inside") {
        if (this.moveTo(this.door.x, this.door.z, GALLOP, dt) < 0.4) { this.state = "inside"; this.rig.root.visible = false; }
        else this.state = "heel";
      }
    } else {
      if (this.state === "inside") {
        this.x = this.door.x;
        this.z = this.door.z;
        this.rig.root.visible = true;
        this.state = "heel";
      }
      const lp = L.position;
      const moved = Math.hypot(lp.x - this.lastLeader.x, lp.z - this.lastLeader.z) / Math.max(dt, 1e-3);
      this.lastLeader.copy(lp);
      this.still = moved > 0.3 ? 0 : this.still + dt;
      const far = Math.hypot(lp.x - this.x, lp.z - this.z);
      // A spot at heel: a little behind and to the side.
      const hx = lp.x - Math.cos(L.heading) * 1.4 + Math.sin(L.heading) * 0.9;
      const hz = lp.z + Math.sin(L.heading) * 1.4 + Math.cos(L.heading) * 0.9;

      // The bear: back to heel, sharpish.
      const nearBear = this.avoid && this.avoid.distanceTo(this.position) < 16;
      if (nearBear && this.state !== "heel") { this.state = "heel"; this.prey = null; }

      switch (this.state) {
        case "heel": {
          this.moveTo(hx, hz, far > 4 ? GALLOP : far > 2.6 ? TROT * 1.4 : TROT, dt);
          if (this.still > 2.5 && !nearBear) {
            if (L.doing === "sit") { this.state = "lie"; }
            else { this.state = "roam"; this.pickRoam(lp); }
          }
          break;
        }
        case "roam": {
          if (this.still === 0 && far > 3) { this.state = "heel"; break; }
          if (this.moveTo(this.tx, this.tz, TROT * 0.8, dt) < 0.3) {
            // A sniff, or — sometimes — a rabbit worth chasing.
            const r = this.rabbits.find((b) => Math.hypot(b.x - this.x, b.z - this.z) < 14);
            if (r && Math.random() < 0.35) { this.state = "chase"; this.prey = r; this.timer = 3.5; this.rig.once("Gallop_Jump", "Gallop", 1.1); this.shown = "chase"; }
            else { this.state = "sniff"; this.timer = 2 + Math.random() * 3; }
          }
          break;
        }
        case "sniff": {
          this.speed = 0;
          this.timer -= dt;
          if (this.still === 0 && far > 3) this.state = "heel";
          else if (this.timer <= 0) { this.state = "roam"; this.pickRoam(lp); }
          break;
        }
        case "lie": {
          // At their feet, in front of the bench.
          const fx = lp.x + Math.cos(L.heading) * 1.1, fz = lp.z - Math.sin(L.heading) * 1.1;
          if (this.moveTo(fx, fz, TROT, dt) < 0.2) this.heading += angleTo(this.heading, L.heading + Math.PI / 2) * Math.min(1, dt * 2);
          if (L.doing !== "sit") this.state = "heel";
          break;
        }
        case "chase": {
          const prey = this.prey!;
          this.timer -= dt;
          this.moveTo(prey.x, prey.z, GALLOP, dt);
          if (Math.hypot(prey.x - this.x, prey.z - this.z) < 7) prey.startle(this.x, this.z);
          if (this.timer <= 0 || far > 18) { this.state = "heel"; this.prey = null; }
          break;
        }
      }
    }

    this.rig.root.position.set(this.x, world.height(this.x, this.z), this.z);
    this.rig.root.rotation.y = this.heading;
    this.position.set(this.x, world.height(this.x, this.z), this.z);
    this.pose(dt);
  }

  private pickRoam(around: Vector3) {
    const { clearPath } = this.habitat.world;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 4.5;
      const x = around.x + Math.cos(a) * r, z = around.z + Math.sin(a) * r;
      if (clearPath(this.x, this.z, x, z)) { this.tx = x; this.tz = z; return; }
    }
    this.tx = this.x;
    this.tz = this.z;
  }

  private pose(dt: number) {
    let clip: string, pace = 1;
    if (this.state === "chase") { this.legs.reset(); this.rig.update(dt); return; } // its own leap-then-gallop
    if (this.speed > 4.5) { clip = "Gallop"; pace = this.speed / GALLOP; }
    else if (this.speed > 0.2) { clip = "Walk"; pace = Math.max(0.6, this.speed / TROT); }
    else if (this.state === "sniff") clip = "Eating";
    else if (this.state === "lie") { clip = "Idle_2_HeadLow"; pace = 0.4; }
    else clip = "Idle";
    if (clip !== this.shown || clip === "Walk" || clip === "Gallop") this.rig.play(clip, pace, 0.3);
    this.shown = clip;
    this.legs.reset();
    this.rig.update(dt);

    // Lying down, posed over the head-low idle: forelegs out in front,
    // hind legs folded under, the body lowered to the ground.
    this.lying += ((this.state === "lie" && this.speed < 0.1 ? 1 : 0) - this.lying) * Math.min(1, dt * 2.5);
    const l = this.lying;
    if (l < 0.01) return;
    this.rig.root.position.y -= LIE.drop * l;
    side.set(Math.cos(this.heading), 0, -Math.sin(this.heading)).cross(UP).negate();
    const { bones } = this.legs;
    for (const s of ["L", "R"]) {
      bend(bones["FrontUpperLeg" + s], side, LIE.frontUpper * l);
      bend(bones["FrontLowerLeg" + s], side, LIE.frontLower * l);
      bend(bones["BackUpperLeg" + s], side, LIE.backUpper * l);
      bend(bones["BackLowerLeg" + s], side, LIE.backLower * l);
    }
  }
}
