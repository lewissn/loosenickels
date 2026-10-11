import { bodyMaterials, makeDeer, makeFox, makeRabbit } from "./bodies";
import { Deer, Rabbit } from "./walker";
import { Flock } from "./flock";
import { Fox } from "./fox";
import { Color } from "three";
import type { Env, Habitat } from "./habitat";
import type { Placed } from "../vegetation";

export type { Creature, Env, Habitat } from "./habitat";

const RABBIT_BROWN = new Color(0x9b8b78), RABBIT_WHITE = new Color(0xf0eee8);

/** Six deer (two of them stags), ten rabbits, a fox, a flock of swallows, and gulls. */
export function populate(habitat: Habitat, roostTree: Placed | undefined) {
  const m = bodyMaterials();
  const rabbits = Array.from({ length: 10 }, () => new Rabbit(habitat, makeRabbit(m)));
  const walkers = [...Array.from({ length: 6 }, (_, i) => new Deer(habitat, makeDeer(m, i < 2), i < 2)), ...rabbits];
  const fox = new Fox(habitat, makeFox(m), rabbits);
  const flocks = [new Flock(habitat, 8, m.bird, false, roostTree), new Flock(habitat, 6, m.gull, true, roostTree)];

  return function update(dt: number, t: number, env: Env) {
    m.rabbit.color.copy(RABBIT_BROWN).lerp(RABBIT_WHITE, habitat.season.snow);
    for (const w of walkers) w.update(dt, t, env);
    fox.update(dt, t, env);
    for (const f of flocks) f.update(dt, t, env);
  };
}
