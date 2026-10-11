import { Vector3, type Material } from "three";
import { ISLAND } from "../world";
import { makeBird, type BirdBody } from "./bodies";
import { addHitbox, type Creature, type Env, type Habitat } from "./habitat";
import type { Placed } from "../vegetation";

/* Swallows loop over the island and roost in a tree at night; gulls circle
   the coast and roost on the beach. */

interface Bird extends BirdBody, Creature {
  r: number;
  oy: number;
  ph: number;
  pos: Vector3;
  prev: Vector3;
}

const want = new Vector3();

export class Flock {
  private ang = Math.random() * 6.28;
  private sp: number;
  private centre = new Vector3();
  private roost: Vector3;
  readonly birds: Bird[] = [];

  constructor(habitat: Habitat, n: number, material: Material, private coastal: boolean, roostTree: Placed | undefined) {
    const { height } = habitat.world;
    this.sp = coastal ? 0.05 : 0.07;
    if (coastal) {
      let best: [number, number] = [ISLAND, 0];
      for (let a = 0; a < 6.28; a += 0.05) {
        const x = Math.cos(a) * 80, z = Math.sin(a) * 80, h = height(x, z);
        if (h > 0.3 && h < 1.5) { best = [x, z]; break; }
      }
      this.roost = new Vector3(best[0], height(best[0], best[1]) + 0.3, best[1]);
    } else {
      const t = roostTree ?? { x: 0, y: 5, z: 0, s: 1 };
      this.roost = new Vector3(t.x, t.y + 5.6 * t.s, t.z);
    }

    for (let i = 0; i < n; i++) {
      const bird: Bird = {
        ...makeBird(material),
        kind: coastal ? "gull" : "bird",
        r: 3 + Math.random() * 6,
        oy: (Math.random() - 0.5) * 4,
        ph: Math.random() * 6.28,
        pos: new Vector3(Math.random() * 40 - 20, 30, Math.random() * 40 - 20),
        prev: new Vector3(),
        label: () => (coastal ? "a gull" : "a swallow"),
        focus: () => bird.pos,
      };
      habitat.scene.add(bird.root);
      addHitbox(habitat, bird.root, 1.6, 0, bird);
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
      b.root.position.copy(b.pos);
      const vx = b.pos.x - b.prev.x, vz = b.pos.z - b.prev.z;
      if (vx * vx + vz * vz > 1e-6) b.root.rotation.y = Math.atan2(-vz, vx);
      const settled = roosting && b.pos.distanceTo(want) < 0.6;
      const glide = Math.sin(t * 0.7 + b.ph) > 0.6;
      const flap = settled ? 0 : glide ? 0.15 : Math.sin(t * 14 + b.ph) * 0.7;
      b.wings[0].rotation.x = -flap;
      b.wings[1].rotation.x = flap;
    });
  }
}
