import { bodyMaterials, COAT, RabbitBody } from "./bodies";
import { Deer, Rabbit } from "./walker";
import { Flock } from "./flock";
import { Fox } from "./fox";
import { loadModels, Rig } from "./models";
import { Farmer } from "./farmer";
import type { CottageSpots } from "../cottage";
import type { Env, Habitat } from "./habitat";
import type { Placed } from "../vegetation";

export type { Creature, Env, Habitat } from "./habitat";


/**
 * Six deer (two of them stags), ten rabbits, a fox, a flock of swallows,
 * gulls, and the man from the cottage. The deer, the fox and the man are
 * models and arrive when they have loaded; everything else is there from
 * the first frame.
 */
export function populate(habitat: Habitat, roostTree: Placed | undefined, cottage: CottageSpots) {
  const m = bodyMaterials();
  const rabbits = Array.from({ length: 10 }, () => new Rabbit(habitat, new RabbitBody(m)));
  const flocks = [new Flock(habitat, 8, m, false, roostTree), new Flock(habitat, 6, m, true, roostTree)];
  const deer: Deer[] = [];
  let fox: Fox | null = null;
  let farmer: Farmer | null = null;
  let gone = false;

  loadModels().then((models) => {
    if (gone) return;
    for (let i = 0; i < 6; i++) {
      const stag = i < 2;
      deer.push(new Deer(habitat, new Rig(stag ? models.stag : models.deer, stag ? 3.3 : 2.7), stag));
    }
    fox = new Fox(habitat, new Rig(models.fox, 1.15), rabbits);
    farmer = new Farmer(habitat, new Rig(models.farmer, 1.75), cottage);
    habitat.people.push(farmer);
  }).catch((error) => console.warn("The animal models didn't load.", error));

  return {
    /** sun is the hour in sun time; sunPace how fast it's moving (sun-days per day of clock). */
    update(dt: number, t: number, env: Env, sun: number, sunPace: number) {
      m.rabbit.color.copy(COAT.summer).lerp(COAT.winter, habitat.season.snow);
      for (const r of rabbits) r.update(dt, t, env);
      for (const d of deer) d.update(dt, t, env);
      fox?.update(dt, env);
      farmer?.update(dt, sun, sunPace);
      for (const f of flocks) f.update(dt, t, env);
    },
    dispose() { gone = true; },
  };
}
