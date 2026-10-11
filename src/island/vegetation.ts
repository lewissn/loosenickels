import {
  BufferGeometry, Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3,
  type Material, type Scene,
} from "three";
import { mat } from "./materials";
import { mulberry32 } from "./noise";
import { SNOW } from "./terrain";
import { boulder, canopy, pine, swaying, trunk, variants } from "./shapes";
import type { Shared } from "./shared";
import type { Detail } from "./detail";
import type { Season } from "./seasons";
import type { World } from "./world";

/* Trees, rocks and meadow flowers, all instanced.

   Pines favour high ground. Meadows (a band of low noise) are left as
   clearings and are where the flowers grow. Deciduous canopies sit around
   bare limbs, so winter has something to show when the leaves go. Trees
   sway in the wind; see shapes.ts for how they are grown. */

/** Splits a list among n variants, by turns. */
function bucket<T>(list: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: n }, () => []);
  list.forEach((t, i) => out[i % n].push(t));
  return out;
}

export interface Placed {
  x: number; y: number; z: number;
  /** Uniform scale, rotation about Y, brightness. */
  s: number; rot: number; v?: number;
  sx?: number; sy?: number; sz?: number;
}

/** How high a broadleaf canopy's centre sits, before the tree's scale. */
const CANOPY_AT = 3.25;

const UP = new Vector3(0, 1, 0), M4 = new Matrix4(), Q = new Quaternion(), PV = new Vector3(), SV = new Vector3();
const tint = new Color();

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

export function createVegetation(scene: Scene, world: World, detail: Detail, shared: Shared) {
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

  const trunkMat = swaying(shared, { color: 0x6a4c38, roughness: 0.95 }, 0.007, 0);
  const pineMat = swaying(shared, { color: 0x2f6b3c }, 0.005, 0.004);
  const leafMat = swaying(shared, { color: 0x4c8c35 }, 0.007, 0.012, CANOPY_AT);
  const cherryMat = swaying(shared, { color: 0xf6b3c9 }, 0.007, 0.012, CANOPY_AT);
  // Shapes come from their own random stream, so growing them never
  // changes where anything is placed.
  const grow = mulberry32(world.seed + 101);
  const leafDetail = detail.mobile ? 1 : 2;
  const canopies = variants(3, (k) => canopy(k, leafDetail), grow);
  const trunks = variants(3, trunk, grow);
  const pines = variants(2, pine, grow);

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
  // The cottage's plot is cleared after placing, rather than skipped during
  // it, so the rest of the island grows exactly as it would without it.
  const clear = (list: Placed[], margin: number) => list.filter((t) => !world.nearSite(t.x, t.z, margin));
  for (const kind of ["pine", "dec", "cherry"] as const) trees[kind] = clear(trees[kind], 9);
  const allDec = trees.dec.concat(trees.cherry);
  bucket(trees.pine, pines.length).forEach((list, v) => place(instanced(pines[v], pineMat, list), list, 0, 1));
  bucket(allDec, trunks.length).forEach((list, v) => place(instanced(trunks[v], trunkMat, list), list, 0, 1));
  const decCanopy = bucket(trees.dec, canopies.length).map((list, v) => ({ list, im: instanced(canopies[v], leafMat, list) }));
  const cherryCanopy = bucket(trees.cherry, canopies.length).map((list, v) => ({ list, im: instanced(canopies[v], cherryMat, list) }));

  // ---- rocks
  const rocks: Placed[] = [];
  for (let tries = 0; rocks.length < 70 && tries < 5000; tries++) {
    const x = (rand() * 2 - 1) * 100, z = (rand() * 2 - 1) * 100, h = height(x, z);
    if (h < -0.6 || h > 30) continue;
    const s = 0.6 + rand() * 1.6;
    rocks.push({ x, y: h - 0.2 * s, z, s, rot: rand() * 6.28, sx: 0.8 + rand() * 0.7, sy: 0.5 + rand() * 0.5, sz: 0.8 + rand() * 0.6, v: 0.8 + rand() * 0.35 });
  }
  const rockMat = new MeshStandardMaterial({ color: 0x9a948a, vertexColors: true, roughness: 0.9 });
  const boulders = variants(3, (k) => boulder(k, detail.mobile ? 2 : 3), grow);
  const keptRocks = clear(rocks, 7);
  bucket(keptRocks, boulders.length).forEach((list, v) => place(instanced(boulders[v], rockMat, list), list, 0, 1));

  // ---- flowers
  const flowers: (Placed & { c: number })[] = [];
  const hues = [0xffffff, 0xffd84a, 0xb58cf0, 0xff8fb0, 0xffffff];
  for (let tries = 0; flowers.length < detail.flowers && tries < 20000; tries++) {
    const x = (rand() * 2 - 1) * 95, z = (rand() * 2 - 1) * 95, h = height(x, z);
    if (h < 1.6 || h > 14 || normalY(x, z) < 0.86 || noise2(x * 0.035, z * 0.035) > 0.1) continue;
    flowers.push({ x, y: h + 0.12, z, s: 0.8 + rand() * 0.6, rot: rand() * 6.28, c: hues[Math.floor(rand() * hues.length)] });
  }
  flowers.splice(0, flowers.length, ...(clear(flowers, 5) as typeof flowers));
  const flowerIM = instanced(new IcosahedronGeometry(0.2, 0), mat(0xffffff, { emissive: 0x111111 }), flowers, false);
  flowers.forEach((f, i) => flowerIM.setColorAt(i, tint.set(f.c)));
  if (flowerIM.instanceColor) flowerIM.instanceColor.needsUpdate = true;

  // ---- the season, applied
  let lastLeaf = -1, lastFlowers = -1;
  function update(season: Season) {
    if (Math.abs(season.leafAmt - lastLeaf) > 0.01) {
      const m = season.leafAmt < 0.04 ? 0 : 0.3 + 0.7 * season.leafAmt;
      for (const c of [...decCanopy, ...cherryCanopy]) place(c.im, c.list, CANOPY_AT, m);
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
