import { Quaternion, Vector3, type Bone, type Object3D } from "three";
import { addHitbox, type Creature, type Habitat } from "./habitat";
import { angleTo } from "./walker";
import type { Rig } from "./models";
import type { CottageSpots } from "../cottage";
import { DAY } from "../time";

/* The man who lives in the cottage.

   His day follows the house's lights: he comes out after breakfast, when
   the kitchen goes dark, and is back indoors just before it lights again at
   dusk. In between he tends the vegetable patch, walks down to look at the
   sea, sits on the bench, and potters about. Rain sends him in at a run,
   and he comes back out when it stops. If you follow him and come close,
   he turns and waves. The animals give him the same wide berth they give
   the camera. */

type Doing = "inside" | "walk" | "tend" | "look" | "sit" | "potter" | "wave";
interface Errand { at: Vector3; face: number; doing: Doing; for: number }

const OUT = 0.3, IN = 0.725; // fractions of the day: after breakfast, before supper
const WALK = 1.9, RUN = 3.8;

const UP = new Vector3(0, 1, 0), side = new Vector3(), local = new Vector3(), qa = new Quaternion(), qw = new Quaternion();

export class Farmer implements Creature {
  kind = "farmer" as const;
  private x: number;
  private z: number;
  private heading: number;
  private doing: Doing = "inside";
  private shown: Doing | null = null;
  private plan: Errand[] = [];
  private errand: Errand | null = null;
  private timer = 0;
  private running = false;
  private lastWave = -99;
  private focusV = new Vector3();
  readonly position = new Vector3();
  private bones: Record<string, Bone | undefined> = {};

  constructor(private habitat: Habitat, private rig: Rig, private spots: CottageSpots) {
    this.x = spots.door.x;
    this.z = spots.door.z;
    this.heading = spots.bench.face;
    habitat.scene.add(rig.root);
    addHitbox(habitat, rig.root, 1.3, 0.9, this);
    rig.root.visible = false;
    // three's loader drops the dots from bone names: UpperLeg.L is UpperLegL.
    for (const name of ["UpperLegL", "UpperLegR", "LowerLegL", "LowerLegR", "Head"]) this.bones[name] = rig.bone(name);
  }

  label() { return "the man from the cottage"; }

  focus() {
    return this.focusV.set(this.x, this.habitat.world.height(this.x, this.z) + 1.4, this.z);
  }

  /** Whether he's out, for the animals to keep clear of. */
  get outside() { return this.doing !== "inside"; }

  private planDay() {
    const { garden, bench, lookout, door } = this.spots;
    // Pottering stays in front of the house, so he never walks through it.
    const potter = () => {
      const a = bench.face + (Math.random() - 0.5) * 2.2, r = 3 + Math.random() * 4;
      const at = door.clone().add(new Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r));
      return { at, face: Math.random() * Math.PI * 2, doing: "potter" as const, for: 2 + Math.random() * 3 };
    };
    const errands: Errand[] = [
      { at: garden.at, face: garden.face, doing: "tend", for: 6 + Math.random() * 6 },
      { at: lookout.at, face: lookout.face, doing: "look", for: 4 + Math.random() * 4 },
      { at: bench.at, face: bench.face, doing: "sit", for: 6 + Math.random() * 8 },
      potter(),
    ];
    // Shuffled, and the garden more often than not first.
    errands.sort(() => Math.random() - 0.5);
    if (Math.random() < 0.6) errands.unshift(errands.splice(errands.findIndex((e) => e.doing === "tend"), 1)[0]);
    this.plan = [...errands, potter(), ...errands.filter(() => Math.random() < 0.5)];
  }

  private go(errand: Errand) {
    this.errand = errand;
    this.doing = "walk";
  }

  update(dt: number, dayF: number) {
    const { world, camera, shared } = this.habitat;
    const rain = shared?.uRain.value ?? 0;
    // He sets off home in time to be in before the kitchen light comes on.
    const walkHome = Math.hypot(this.spots.door.x - this.x, this.spots.door.z - this.z) / WALK / DAY;
    const shouldBeOut = dayF > OUT && dayF + (this.doing === "inside" ? 0 : walkHome) < IN && rain < 0.3;

    if (this.doing === "inside") {
      if (shouldBeOut) {
        this.rig.root.visible = true;
        this.x = this.spots.door.x;
        this.z = this.spots.door.z;
        this.running = false;
        this.planDay();
        this.go(this.plan.shift()!);
      }
    } else if (!shouldBeOut && this.errand?.doing !== "inside") {
      // Home: at a run if it's raining.
      this.running = rain >= 0.3;
      this.go({ at: this.spots.door, face: 0, doing: "inside", for: 0 });
    }

    if (this.doing === "walk" && this.errand) {
      const dx = this.errand.at.x - this.x, dz = this.errand.at.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.25) {
        this.doing = this.errand.doing;
        this.timer = this.errand.for;
        if (this.doing === "inside") this.rig.root.visible = false;
      } else {
        this.heading += angleTo(this.heading, Math.atan2(-dz, dx)) * Math.min(1, dt * 5);
        const sp = Math.min(this.running ? RUN : WALK, d / Math.max(dt, 1e-3));
        this.x += Math.cos(this.heading) * sp * dt;
        this.z -= Math.sin(this.heading) * sp * dt;
      }
    } else if (this.doing !== "inside") {
      // Settle to face the right way, then see the errand through.
      const face = this.doing === "wave" ? Math.atan2(-(camera.position.z - this.z), camera.position.x - this.x) : this.errand?.face ?? this.heading;
      this.heading += angleTo(this.heading, face) * Math.min(1, dt * 3);
      this.timer -= dt;
      if (this.doing === "wave" && this.timer <= 0) {
        this.doing = this.errand?.doing ?? "potter";
        this.timer = 2;
      } else if (this.timer <= 0) {
        const next = this.plan.shift();
        if (next) this.go(next);
        else { this.planDay(); this.go(this.plan.shift()!); }
      }
      // Someone watching from close by gets a wave, now and then.
      const near = camera.position.distanceTo(this.focus());
      const now = performance.now() / 1000;
      if (near < 11 && this.doing !== "sit" && this.doing !== "wave" && now - this.lastWave > 25) {
        this.lastWave = now;
        this.doing = "wave";
        this.timer = 2.4;
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
    if (d !== this.shown) {
      if (d === "walk") this.rig.play(this.running ? "Run" : "Walk", this.running ? 1 : 0.95, 0.3);
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
 * the bone's own axes happen to point: negative swings it forward.
 */
function bend(bone: Object3D | undefined, angle: number) {
  if (!bone) return;
  bone.getWorldQuaternion(qw);
  local.copy(side).applyQuaternion(qw.invert()).normalize();
  bone.quaternion.multiply(qa.setFromAxisAngle(local, angle));
}
