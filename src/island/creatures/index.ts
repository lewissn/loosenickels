import { Color } from "three";
import { bodyMaterials, makeRabbit } from "./bodies";
import { Deer, Rabbit } from "./walker";
import { Flock } from "./flock";
import { Fox } from "./fox";
import { loadModels, Rig } from "./models";
import type { Env, Habitat } from "./habitat";
import type { Placed } from "../vegetation";

export type { Creature, Env, Habitat } from "./habitat";

const RABBIT_BROWN = new Color(0x9b8b78), RABBIT_WHITE = new Color(0xf0eee8);

/**
 * Six deer (two of them stags), ten rabbits, a fox, a flock of swallows,
 * and gulls. The deer and the fox are models and arrive when they have
 * loaded; everything else is there from the first frame.
 */
export function populate(habitat: Habitat, roostTree: Placed | undefined) {
  const m = bodyMaterials();
  const rabbits = Array.from({ length: 10 }, () => new Rabbit(habitat, makeRabbit(m)));
  const flocks = [new Flock(habitat, 8, m.bird, false, roostTree), new Flock(habitat, 6, m.gull, true, roostTree)];
  const deer: Deer[] = [];
  let fox: Fox | null = null;
  let gone = false;

  loadModels().then((models) => {
    if (gone) return;
    for (let i = 0; i < 6; i++) {
      const stag = i < 2;
      deer.push(new Deer(habitat, new Rig(stag ? models.stag : models.deer, stag ? 3.3 : 2.7), stag));
    }
    fox = new Fox(habitat, new Rig(models.fox, 1.15), rabbits);
  }).catch((error) => console.warn("The animal models didn't load.", error));

  return {
    update(dt: number, t: number, env: Env) {
      m.rabbit.color.copy(RABBIT_BROWN).lerp(RABBIT_WHITE, habitat.season.snow);
      for (const r of rabbits) r.update(dt, t, env);
      for (const d of deer) d.update(dt, t, env);
      fox?.update(dt, env);
      for (const f of flocks) f.update(dt, t, env);
    },
    dispose() { gone = true; },
  };
}
