import { bodyMaterials, COAT, RabbitBody } from "./bodies";
import { Deer, Rabbit } from "./walker";
import { Flock } from "./flock";
import { Fox } from "./fox";
import { loadModels, Rig } from "./models";
import { Household } from "./household";
import { Color, MeshStandardMaterial, type Mesh, type Object3D } from "three";
import type { CottageSpots } from "../cottage";
import type { Env, Habitat } from "./habitat";
import type { Placed } from "../vegetation";

export type { Creature, Env, Habitat } from "./habitat";


const BRUNETTE = new Color(0x4a2e1c);

/** Sets the colour of every material of a given name in a model. */
function recolour(model: Object3D, name: string, colour: Color) {
  model.traverse((o) => {
    const m = (o as Mesh).material;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (mat instanceof MeshStandardMaterial && mat.name === name) mat.color.copy(colour);
  });
}

/**
 * Six deer (two of them stags), ten rabbits, a fox, a flock of swallows,
 * gulls, and the couple from the cottage. The deer, the fox and the couple
 * are models and arrive when they have loaded; everything else is there
 * from the first frame.
 */
export function populate(habitat: Habitat, roostTree: Placed | undefined, cottage: CottageSpots, onCouple?: (h: Household) => void) {
  const m = bodyMaterials();
  const rabbits = Array.from({ length: 10 }, () => new Rabbit(habitat, new RabbitBody(m)));
  const flocks = [new Flock(habitat, 8, m, false, roostTree), new Flock(habitat, 6, m, true, roostTree)];
  const deer: Deer[] = [];
  let fox: Fox | null = null;
  let household: Household | null = null;
  let gone = false;

  loadModels().then((models) => {
    if (gone) return;
    for (let i = 0; i < 6; i++) {
      const stag = i < 2;
      deer.push(new Deer(habitat, new Rig(stag ? models.stag : models.deer, stag ? 3.3 : 2.7), stag));
    }
    fox = new Fox(habitat, new Rig(models.fox, 1.15), rabbits);
    // Both brunette; he's the taller.
    recolour(models.woman.scene, "Red", BRUNETTE); // her hair; her shoes share it
    recolour(models.woman.scene, "Brown", BRUNETTE); // her brows
    household = new Household(habitat, cottage, new Rig(models.farmer, 1.82), new Rig(models.woman, 1.66));
    onCouple?.(household);
  }).catch((error) => console.warn("The animal models didn't load.", error));

  return {
    /** sun is the hour in sun time; sunPace how fast it's moving (sun-days per day of clock). */
    update(dt: number, t: number, env: Env, sun: number, sunPace: number) {
      m.rabbit.color.copy(COAT.summer).lerp(COAT.winter, habitat.season.snow);
      for (const r of rabbits) r.update(dt, t, env);
      for (const d of deer) d.update(dt, t, env);
      fox?.update(dt, env);
      household?.update(dt, sun, sunPace, habitat.shared?.uRain.value ?? 0);
      for (const f of flocks) f.update(dt, t, env);
    },
    dispose() { gone = true; },
    /** For looking at while developing. */
    get household() { return household; },
  };
}
