import { Vector3 } from "three";
import { ISLAND } from "../world";
import { BirdBody, type BodyMaterials } from "./bodies";
import { angleTo } from "./walker";
import { addHitbox, type Creature, type Env, type Habitat } from "./habitat";
import type { Placed } from "../vegetation";

/* Swallows loop over the island in quick flapping bursts and roost in a
   tree at night; gulls circle the coast on long glides and roost on the
   beach. Each bird banks into its turns, pitches as it climbs and dives,
   and folds its wings when it settles. */

interface Bird extends Creature {
  body: BirdBody;
  r: number;
  oy: number;
  ph: number;
  pos: Vector3;
  prev: Vector3;
  heading: number;
  bank: number;
  pitch: number;
  flap: number;
  beat: number;
  fold: number;
}

const want = new Vector3();

export class Flock {
  private ang = Math.random() * 6.28;
  private sp: number;
  private centre = new Vector3();
  private roost: Vector3;
  readonly birds: Bird[] = [];

  constructor(habitat: Habitat, n: number, m: BodyMaterials, private coastal: boolean, roostTree: Placed | undefined) {
    const { height } = habitat.world;
    this.sp = coastal ? 0.05 : 0.07;
    if (coastal) {
      let best: [number, number] = [ISLAND, 0];
      for (let a = 0; a < 6.28; a += 0.05) {
        const x = Math.cos(a) * 80, z = Math.sin(a) * 80, h = height(x, z);
        if (h > 0.3 && h < 1.5) { best = [x, z]; break; }
      }
      this.roost = new Vector3(best[0], height(best[0], best[1]) + 0.25, best[1]);
    } else {
      const t = roostTree ?? { x: 0, y: 5, z: 0, s: 1 };
      this.roost = new Vector3(t.x, t.y + 5.6 * t.s, t.z);
    }

    for (let i = 0; i < n; i++) {
      const body = new BirdBody(coastal ? "gull" : "swallow", m);
      const bird: Bird = {
        body,
        kind: coastal ? "gull" : "bird",
        r: 3 + Math.random() * 6,
        oy: (Math.random() - 0.5) * 4,
        ph: Math.random() * 6.28,
        pos: new Vector3(Math.random() * 40 - 20, 30, Math.random() * 40 - 20),
        prev: new Vector3(),
        heading: 0, bank: 0, pitch: 0, flap: Math.random() * 6.28, beat: 1, fold: 0,
        label: () => (coastal ? "a gull" : "a swallow"),
        focus: () => bird.pos,
      };
      habitat.scene.add(body.root);
      addHitbox(habitat, body.root, 1.6, 0, bird);
      this.birds.push(bird);
    }
  }

  update(dt: number, t: number, env: Env) {
    const roosting = env.elev < -0.08;
    this.ang += dt * this.sp;
    const a0 = this.ang;
    if (this.coastal) this.centre.set(Math.cos(a0) * 95, 22 + Math.sin(a0 * 3) * 4, Math.sin(a0) * 95);
    else this.centre.set(Math.cos(a0 * 0.7) * 40 + Math.sin(a0 * 0.31) * 20, 30 + Math.sin(a0 * 1.3) * 6, Math.sin(a0 * 0.7) * 40);

    this.birds.forEach((b, i) => {
      b.prev.copy(b.pos);
      if (roosting) {
        want.set(this.roost.x + Math.cos(i * 2.4) * 0.8, this.roost.y, this.roost.z + Math.sin(i * 2.4) * 0.8);
        b.pos.lerp(want, Math.min(1, dt * 0.6));
      } else {
        const a = this.ang * 9 + b.ph;
        want.set(this.centre.x + Math.cos(a) * b.r, this.centre.y + b.oy + Math.sin(t * 0.9 + b.ph) * 1.5, this.centre.z + Math.sin(a) * b.r);
        b.pos.lerp(want, Math.min(1, dt * 1.5));
      }
      b.body.root.position.copy(b.pos);

      const vx = b.pos.x - b.prev.x, vy = b.pos.y - b.prev.y, vz = b.pos.z - b.prev.z;
      const speed = Math.hypot(vx, vz) / Math.max(dt, 1e-4);
      let turn = 0;
      if (vx * vx + vz * vz > 1e-6) {
        const h = Math.atan2(-vz, vx);
        turn = angleTo(b.heading, h) / Math.max(dt, 1e-4);
        b.heading = h;
      }
      b.body.root.rotation.y = b.heading;
      const k = Math.min(1, dt * 3);
      b.bank += (Math.max(-0.9, Math.min(0.9, -turn * 0.35)) - b.bank) * k;
      b.pitch += (Math.max(-0.5, Math.min(0.5, (vy / Math.max(dt, 1e-4)) * 0.08)) - b.pitch) * k;

      // Settled birds fold their wings; flying ones flap or glide.
      const settled = roosting && b.pos.distanceTo(want) < 0.6;
      let beat: number, rate: number;
      if (this.coastal) {
        // Gulls: long glides, a few slow beats to climb.
        beat = vy > 0.002 || Math.sin(t * 0.35 + b.ph) > 0.55 ? 1 : 0;
        rate = 7;
      } else {
        // Swallows: bursts of quick beats between short glides.
        beat = Math.sin(t * 0.9 + b.ph) > -0.3 ? 1 : 0;
        rate = 16;
      }
      if (settled) beat = 0;
      b.beat += (beat - b.beat) * Math.min(1, dt * 4);
      b.fold += ((settled ? 1 : 0) - b.fold) * Math.min(1, dt * 3);
      b.flap += dt * rate * (0.6 + 0.4 * b.beat) * (speed > 0.1 || !settled ? 1 : 0);
      b.body.pose(b.flap, b.beat, b.fold, settled ? 0 : b.bank, settled ? 0 : b.pitch);
    });
  }
}
