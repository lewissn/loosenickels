# Model credits

Every model here is in the public domain (CC0). Credit is not required, and
is given gladly.

| File | Model | Author | Licence | Source |
| ---- | ----- | ------ | ------- | ------ |
| `deer.glb` | Deer  | [Quaternius](https://quaternius.com) | CC0 1.0 | [Poly Pizza](https://poly.pizza/m/T6Cs7tmMHJ), from the [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) |
| `stag.glb` | Stag  | [Quaternius](https://quaternius.com) | CC0 1.0 | [Poly Pizza](https://poly.pizza/m/tQdzbZ1Cmw), same pack |
| `fox.glb`  | Fox   | [Quaternius](https://quaternius.com) | CC0 1.0 | [Poly Pizza](https://poly.pizza/m/Bc97C66HKi), same pack |
| `farmer.glb` | Farmer | [Quaternius](https://quaternius.com) | CC0 1.0 | [Poly Pizza](https://poly.pizza/m/7pn3R6hPvE) |

The files here are built from those sources by `node tools/models.mjs`,
which keeps only the animations the island plays, quantises the geometry
and compresses it with meshopt. Nothing else about the models is changed.

The rabbits and birds are still made in code: no CC0 animated wild rabbit
or bird was available when these were chosen (the Quaternius "Rabbit" is an
upright cartoon character).
