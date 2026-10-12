import { Quaternion, Vector3, type Bone, type Object3D } from "three";
import { addHitbox, type Creature, type Habitat } from "./habitat";
import { angleTo } from "./walker";
import type { Rig } from "./models";
import type { CottageSpots } from "../cottage";
import { DAY } from "../time";

/* The couple who live in the cottage.

   Their day follows the house's lights: out after breakfast, when the
   kitchen goes dark, and back in just before it lights again at dusk —
   setting off early enough to make the walk. In between they share a
   shuffled day of "beats": sitting side by side on the bench, standing
   together above the shore to look at the sea, one tending the vegetable
   patch while the other potters about, each going their own way for a
   while. A beat ends once both have arrived and spent their time there.
   Rain sends them both in at a run, and they come out again when it stops.
   Whoever you follow, come close and they'll turn and wave. The animals
   keep clear of them as they do of the camera. */

type Doing = "inside" | "walk" | "tend" | "look" | "sit" | "potter" | "wave";
interface Errand { at: Vector3; face: number; doing: Doing }
type Beat = { errands: [Errand, Errand]; for: number };

const OUT = 0.3, IN = 0.725; // sun time: after breakfast, before supper
const WALK = 1.45, RUN = 3.8;

const UP = new Vector3(0, 1, 0), side = new Vector3(), local = new Vector3();
const qa = new Quaternion(), qw = new Quaternion();

/** One of the two: walking, standing, sitting and waving, under the household's direction. */
class Resident implements Creature {
  kind = "person" as const;
  x: number;
  z: number;
  heading: number;
  doing: Doing = "inside";
  errand: Errand | null = null;
  running = false;
  /** Walked by you rather than by the household; speed is how fast. */
  controlled = false;
  speed = 0;
  private shown: Doing | null = null;
  private resume: Doing = "potter";
  private waveTimer = 0;
  private lastWave = -99;
  private focusV = new Vector3();
  readonly position = new Vector3();
  private bones: Record<string, Bone | undefined> = {};

  constructor(private habitat: Habitat, readonly rig: Rig, private spots: CottageSpots, private name: string) {
    this.x = spots.door.x;
    this.z = spots.door.z;
    this.heading = spots.bench.face;
    habitat.scene.add(rig.root);
    addHitbox(habitat, rig.root, 1.3, 0.9, this);
    rig.root.visible = false;
    // three's loader drops the dots from bone names: UpperLeg.L is UpperLegL.
    for (const b of ["UpperLegL", "UpperLegR", "LowerLegL", "LowerLegR"]) this.bones[b] = rig.bone(b);
  }

  label() { return this.name; }

  focus() {
    return this.focusV.set(this.x, this.habitat.world.height(this.x, this.z) + 1.4, this.z);
  }

  get outside() { return this.doing !== "inside"; }
  /** Whether they're at the errand's spot, doing it. */
  get there() { return this.controlled || (this.doing !== "walk" && this.doing !== "inside"); }

  comeOut() {
    this.rig.root.visible = true;
    this.x = this.spots.door.x;
    this.z = this.spots.door.z;
    this.doing = "potter";
  }

  go(errand: Errand, running = false) {
    this.errand = errand;
    this.running = running;
    this.doing = "walk";
  }

  distanceTo(p: Vector3) { return Math.hypot(p.x - this.x, p.z - this.z); }

  /** Sits down on the bench, facing the sea (when walked by you). */
  sitAt(at: Vector3, face: number) {
    this.x = at.x;
    this.z = at.z;
    this.heading = face;
    this.doing = "sit";
  }

  update(dt: number) {
    const { world, camera } = this.habitat;
    if (this.controlled) {
      // You're walking him: walk or run to match his pace, otherwise stand.
      if (this.doing !== "sit") {
        this.doing = this.speed > 0.15 ? "walk" : "potter";
        this.running = this.speed > 3;
      }
    } else if (this.doing === "walk" && this.errand) {
      const dx = this.errand.at.x - this.x, dz = this.errand.at.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.25) {
        this.doing = this.errand.doing;
        if (this.doing === "inside") this.rig.root.visible = false;
      } else {
        this.heading += angleTo(this.heading, Math.atan2(-dz, dx)) * Math.min(1, dt * 5);
        const sp = Math.min(this.running ? RUN : WALK, d / Math.max(dt, 1e-3));
        this.x += Math.cos(this.heading) * sp * dt;
        this.z -= Math.sin(this.heading) * sp * dt;
      }
    } else if (this.doing !== "inside") {
      const face = this.doing === "wave"
        ? Math.atan2(-(camera.position.z - this.z), camera.position.x - this.x)
        : this.errand?.face ?? this.heading;
      this.heading += angleTo(this.heading, face) * Math.min(1, dt * 3);
      if (this.doing === "wave") {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.doing = this.resume;
      } else if (this.doing !== "sit" && camera.position.distanceTo(this.focus()) < 11 && performance.now() / 1000 - this.lastWave > 25) {
        // Someone watching from close by gets a wave, now and then.
        this.lastWave = performance.now() / 1000;
        this.resume = this.doing;
        this.doing = "wave";
        this.waveTimer = 2.4;
      }
    }

    const seated = this.doing === "sit";
    const ground = seated ? this.spots.bench.seat - 0.42 : world.height(this.x, this.z);
    this.rig.root.position.set(this.x, ground, this.z);
    this.rig.root.rotation.y = this.heading;
    this.position.set(this.x, ground, this.z);
    this.pose(dt);
  }

  private pose(dt: number) {
    const d = this.doing;
    if (this.controlled && d === "walk") {
      // The stride keeps pace with however fast you're walking him.
      this.rig.play(this.running ? "Run" : "Walk", this.running ? this.speed / RUN : this.speed / WALK * 0.85, 0.25);
      this.shown = null; // so stopping re-picks the idle
    } else if (d !== this.shown) {
      if (d === "walk") this.rig.play(this.running ? "Run" : "Walk", this.running ? 1 : 0.85, 0.3);
      else if (d === "tend") this.rig.play("Interact", 0.8, 0.5);
      else if (d === "wave") this.rig.once("Wave", "Idle", 1, 0.3);
      else if (d === "sit" || d === "look") this.rig.play("Idle_Neutral", 0.7, 0.6);
      else this.rig.play("Idle", 1, 0.5);
      this.shown = d;
    }
    this.rig.update(dt);
    // There's no sitting animation, so sitting is posed over the idle:
    // thighs swung forward to the seat, shins back down to the ground.
    if (d === "sit") {
      side.set(Math.cos(this.heading), 0, -Math.sin(this.heading)).cross(UP).negate();
      bend(this.bones.UpperLegL, -1.5);
      bend(this.bones.UpperLegR, -1.5);
      bend(this.bones.LowerLegL, 1.55);
      bend(this.bones.LowerLegR, 1.55);
    }
  }
}

/**
 * Swings a bone about the body's side-to-side axis (`side`), whatever way
 * the bone's own axes happen to point: negative swings it forward. The
 * rig's leg axes sit at an angle to the body, so a fixed axis won't do.
 */
function bend(bone: Object3D | undefined, angle: number) {
  if (!bone) return;
  bone.getWorldQuaternion(qw);
  local.copy(side).applyQuaternion(qw.invert()).normalize();
  bone.quaternion.multiply(qa.setFromAxisAngle(local, angle));
}

/** The pair of them, and the shape of their day. */
export class Household {
  readonly people: [Resident, Resident];
  private beats: Beat[] = [];
  private beat: Beat | null = null;
  private together = 0;
  private stagger = 0;
  private home = true;

  constructor(habitat: Habitat, private spots: CottageSpots, his: Rig, hers: Rig) {
    this.people = [
      new Resident(habitat, his, spots, "the man from the cottage"),
      new Resident(habitat, hers, spots, "the woman from the cottage"),
    ];
    for (const p of this.people) habitat.people.push(p);
  }

  /** Spots side by side, `gap` apart across the way they'll face. */
  private pair(at: Vector3, face: number, gap: number, doing: Doing): [Errand, Errand] {
    const lx = -Math.sin(face) * gap / 2, lz = -Math.cos(face) * gap / 2;
    return [
      { at: at.clone().add(new Vector3(lx, 0, lz)), face, doing },
      { at: at.clone().add(new Vector3(-lx, 0, -lz)), face, doing },
    ];
  }

  private potterSpot(near: Vector3): Errand {
    const a = this.spots.bench.face + (Math.random() - 0.5) * 2.2, r = 2 + Math.random() * 4;
    return { at: near.clone().add(new Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r)), face: Math.random() * Math.PI * 2, doing: "potter" };
  }

  private planDay() {
    const { garden, bench, lookout, door } = this.spots;
    const tend: Errand = { at: garden.at, face: garden.face, doing: "tend" };
    const beats: Beat[] = [
      { errands: this.pair(bench.at, bench.face, 0.85, "sit"), for: 14 + Math.random() * 12 },
      { errands: this.pair(lookout.at, lookout.face, 1.0, "look"), for: 8 + Math.random() * 6 },
      { errands: [tend, this.potterSpot(garden.at)], for: 12 + Math.random() * 8 },
      { errands: [this.potterSpot(garden.at), tend], for: 12 + Math.random() * 8 },
      { errands: [this.potterSpot(door), this.potterSpot(door)], for: 5 + Math.random() * 5 },
    ];
    beats.sort(() => Math.random() - 0.5);
    this.beats = [...beats, ...beats.filter(() => Math.random() < 0.5)];
  }

  private nextBeat() {
    if (this.beats.length === 0) this.planDay();
    this.beat = this.beats.shift()!;
    this.together = 0;
    this.people.forEach((p, i) => { if (!p.controlled) p.go(this.beat!.errands[i]); });
  }

  /** The man, for walking as. */
  get him() { return this.people[0]; }

  /** Hands him over to you, or back to the household. */
  control(on: boolean) {
    const him = this.people[0];
    if (on) {
      // Out of the door, facing the sea.
      if (him.doing === "inside") { him.comeOut(); him.heading = this.spots.bench.face; }
      him.controlled = true;
      him.speed = 0;
    } else {
      him.controlled = false;
      him.speed = 0;
      // Back to his day: to the current beat, or home if it's time.
      if (this.home || !this.beat) him.go({ at: this.spots.door, face: 0, doing: "inside" });
      else him.go(this.beat.errands[0]);
    }
  }

  /** sun is the hour in sun time; sunPace how fast sun time is moving just now. */
  update(dt: number, sun: number, sunPace: number, rain: number) {
    const [him, her] = this.people;
    const door = this.spots.door;
    const walkHome = (Math.max(him.distanceTo(door), her.distanceTo(door)) / WALK / DAY) * sunPace;
    // Once in, they only come back out if there's a fair stretch of day left,
    // so a rain shower late on doesn't have them bobbing in and out.
    const out = sun > OUT && sun + (this.home ? 0.1 : walkHome) < IN && rain < 0.3;

    if (this.home && out) {
      // He comes out first; she follows a moment later.
      this.home = false;
      this.stagger = 1.6;
      if (!him.controlled) him.comeOut();
      this.planDay();
      this.nextBeat();
      her.doing = "inside";
    } else if (!this.home && !out) {
      this.home = true;
      this.beat = null;
      // Whoever you're walking stays out with you.
      for (const p of this.people) if (p.doing !== "inside" && !p.controlled) p.go({ at: door, face: 0, doing: "inside" }, rain >= 0.3);
    }

    if (!this.home) {
      if (this.stagger > 0) {
        this.stagger -= dt;
        if (this.stagger <= 0 && this.beat) { her.comeOut(); her.go(this.beat.errands[1]); }
      }
      // A beat ends once they've both arrived and spent its time there.
      if (this.beat && him.there && her.there && this.stagger <= 0) {
        this.together += dt;
        if (this.together > this.beat.for) this.nextBeat();
      }
    }
    for (const p of this.people) p.update(dt);
  }
}
