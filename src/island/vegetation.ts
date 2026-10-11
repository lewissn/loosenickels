import {
  BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, IcosahedronGeometry,
  InstancedMesh, Matrix4, Quaternion, Vector3, type Material, type Scene,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mat } from "./materials";
import { SNOW } from "./terrain";
import type { Detail } from "./detail";
import type { Season } from "./seasons";
import type { World } from "./world";

/* Trees, rocks and meadow flowers, all instanced.

   Pines favour high ground. Meadows (a band of low noise) are left as
   clearings and are where the flowers grow. Deciduous canopies sit around
   bare branches, so winter has something to show when the leaves go. */

export interface Placed {
  x: number; y: number; z: number;
  /** Uniform scale, rotation about Y, brightness. */
  s: number; rot: number; v?: number;
  sx?: number; sy?: number; sz?: number;
}

const UP = new Vector3(0, 1, 0), M4 = new Matrix4(), Q = new Quaternion(), PV = new Vector3(), SV = new Vector3();
const tint = new Color();

const pineTrunkGeo = () => new CylinderGeometry(0.22, 0.35, 2.2, 5).translate(0, 1.1, 0);
const pineCanopyGeo = () => mergeGeometries([
  new ConeGeometry(1.7, 3.2, 6).translate(0, 3.0, 0),
  new ConeGeometry(1.25, 2.6, 6).translate(0, 4.6, 0),
  new ConeGeometry(0.8, 1.9, 6).translate(0, 5.9, 0),
]);
const decTrunkGeo = () => mergeGeometries([
  new CylinderGeometry(0.2, 0.32, 2.8, 5).translate(0, 1.4, 0),
  new CylinderGeometry(0.07, 0.11, 1.7, 4).rotateZ(-0.7).translate(0.5, 2.9, 0),
  new CylinderGeometry(0.07, 0.11, 1.6, 4).rotateZ(0.65).translate(-0.45, 3.0, 0.1),
  new CylinderGeometry(0.06, 0.1, 1.5, 4).rotateX(0.65).translate(0, 3.1, 0.45),
]);

function place(im: InstancedMesh, list: Placed[], yOff: number, mul: number) {
  list.forEach((t, i) => {
    Q.setFromAxisAngle(UP, t.rot);
    PV.set(t.x, t.y + yOff * t.s, t.z);
    const k = t.s * mul;
    SV.set(k * (t.sx ?? 1), k * (t.sy ?? 1), k * (t.sz ?? 1));
    M4.compose(PV, Q, SV);
    im.setMatrixAt(i, M4);
  });
  im.instanceMatrix.needsUpdate = true;
}

export function createVegetation(scene: Scene, world: World, detail: Detail) {
  const { rand, height, normalY, noise2 } = world;

  function instanced(geo: BufferGeometry, material: Material, list: Placed[], shadow = true) {
    const im = new InstancedMesh(geo, material, Math.max(1, list.length));
    im.count = list.length;
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.frustumCulled = false;
    list.forEach((t, i) => im.setColorAt(i, tint.setScalar(t.v ?? 1)));
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
    return im;
  }

  const trunkMat = mat(0x6b4a32), pineMat = mat(0x2f6b3c), leafMat = mat(0x4c8c35), cherryMat = mat(0xf6b3c9);

  // ---- trees
  const trees: Record<"pine" | "dec" | "cherry", Placed[]> = { pine: [], dec: [], cherry: [] };
  for (let n = 0, tries = 0; n < detail.trees && tries < 30000; tries++) {
    const x = (rand() * 2 - 1) * 100, z = (rand() * 2 - 1) * 100, h = height(x, z);
    if (h < 1.4 || h > 24 || normalY(x, z) < 0.82) continue;
    if (noise2(x * 0.035, z * 0.035) < -0.15 && rand() > 0.08) continue; // leave meadows open
    const pPine = h > 13 ? 0.85 : h > 7 ? 0.45 : 0.15;
    const kind = rand() < pPine ? "pine" : rand() < 0.16 ? "cherry" : "dec";
    trees[kind].push({ x, y: h - 0.25, z, s: 0.7 + rand() * 0.6, rot: rand() * Math.PI * 2, v: 0.82 + rand() * 0.3 });
    n++;
  }
  const allDec = trees.dec.concat(trees.cherry);
  const canopyGeo = new IcosahedronGeometry(1.9, 0).scale(1, 0.85, 1);
  place(instanced(pineTrunkGeo(), trunkMat, trees.pine), trees.pine, 0, 1);
  place(instanced(pineCanopyGeo(), pineMat, trees.pine), trees.pine, 0, 1);
  place(instanced(decTrunkGeo(), trunkMat, allDec), allDec, 0, 1);
  const decCanopy = instanced(canopyGeo, leafMat, trees.dec);
  const cherryCanopy = instanced(canopyGeo, cherryMat, trees.cherry);

  // ---- rocks
  const rocks: Placed[] = [];
  for (let tries = 0; rocks.length < 70 && tries < 5000; tries++) {
    const x = (rand() * 2 - 1) * 100, z = (rand() * 2 - 1) * 100, h = height(x, z);
    if (h < -0.6 || h > 30) continue;
    const s = 0.6 + rand() * 1.6;
    rocks.push({ x, y: h - 0.2 * s, z, s, rot: rand() * 6.28, sx: 0.8 + rand() * 0.7, sy: 0.5 + rand() * 0.5, sz: 0.8 + rand() * 0.6, v: 0.8 + rand() * 0.35 });
  }
  place(instanced(new DodecahedronGeometry(1, 0), mat(0x8e8880), rocks), rocks, 0, 1);

  // ---- flowers
  const flowers: (Placed & { c: number })[] = [];
  const hues = [0xffffff, 0xffd84a, 0xb58cf0, 0xff8fb0, 0xffffff];
  for (let tries = 0; flowers.length < detail.flowers && tries < 20000; tries++) {
    const x = (rand() * 2 - 1) * 95, z = (rand() * 2 - 1) * 95, h = height(x, z);
    if (h < 1.6 || h > 14 || normalY(x, z) < 0.86 || noise2(x * 0.035, z * 0.035) > 0.1) continue;
    flowers.push({ x, y: h + 0.12, z, s: 0.8 + rand() * 0.6, rot: rand() * 6.28, c: hues[Math.floor(rand() * hues.length)] });
  }
  const flowerIM = instanced(new IcosahedronGeometry(0.2, 0), mat(0xffffff, { emissive: 0x111111 }), flowers, false);
  flowers.forEach((f, i) => flowerIM.setColorAt(i, tint.set(f.c)));
  if (flowerIM.instanceColor) flowerIM.instanceColor.needsUpdate = true;

  // ---- the season, applied
  let lastLeaf = -1, lastFlowers = -1;
  function update(season: Season) {
    if (Math.abs(season.leafAmt - lastLeaf) > 0.01) {
      const m = season.leafAmt < 0.04 ? 0 : 0.3 + 0.7 * season.leafAmt;
      place(decCanopy, trees.dec, 3.6, m);
      place(cherryCanopy, trees.cherry, 3.6, m);
      lastLeaf = season.leafAmt;
    }
    if (Math.abs(season.flowers - lastFlowers) > 0.01) {
      place(flowerIM, flowers, 0, season.flowers < 0.04 ? 0 : season.flowers);
      lastFlowers = season.flowers;
    }
    leafMat.color.copy(season.leaf);
    cherryMat.color.copy(season.blossom);
    pineMat.color.copy(season.pine).lerp(SNOW, season.snow * 0.3);
  }

  return { trees, update };
}
