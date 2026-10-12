/**
 * Builds the animal models in public/models from their published sources.
 *
 *   node tools/models.mjs
 *
 * Each source is a CC0 glTF from Quaternius (see public/models/CREDITS.md).
 * The originals carry every animation twice (with and without an armature
 * prefix) and clips the island never plays, so this keeps only the clips
 * listed below, drops everything unused, quantises the vertices and
 * compresses with meshopt. three's GLTFLoader decodes meshopt with the
 * decoder that ships in the three package — nothing is loaded from a CDN.
 *
 * Sources are fetched once and cached in the system temp directory.
 */

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, resample } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const MODELS = {
  deer: {
    url: "https://static.poly.pizza/4b6c2a41-43c7-404c-ae37-e8c4645ff93b.glb",
    clips: ["Idle", "Idle_2", "Idle_Headlow", "Eating", "Walk", "Gallop"],
  },
  stag: {
    url: "https://static.poly.pizza/a9c69fbc-bf7c-4585-9a49-a82e0be1ac6b.glb",
    clips: ["Idle", "Idle_2", "Idle_Headlow", "Eating", "Walk", "Gallop"],
  },
  fox: {
    url: "https://static.poly.pizza/e18e86df-1692-48d8-ac6e-1e25ab4ad574.glb",
    clips: ["Idle", "Idle_2", "Idle_2_HeadLow", "Eating", "Walk", "Gallop", "Gallop_Jump"],
  },
  farmer: {
    url: "https://static.poly.pizza/81f2f0cf-6f53-4b57-92ea-dba0928620f2.glb",
    clips: ["Idle", "Idle_Neutral", "Interact", "Walk", "Run", "Wave"],
  },
  woman: {
    url: "https://static.poly.pizza/46d6db5a-3c9f-4238-8cdf-8eb7194498dc.glb",
    clips: ["Idle", "Idle_Neutral", "Interact", "Walk", "Run", "Wave"],
  },
};

const out = path.resolve("public/models");
const cache = path.join(os.tmpdir(), "island-model-sources");

async function source(name, url) {
  const file = path.join(cache, `${name}.glb`);
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: ${res.status} fetching ${url}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFile(file);
}

await MeshoptEncoder.ready;
await mkdir(out, { recursive: true });
await mkdir(cache, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

for (const [name, { url, clips }] of Object.entries(MODELS)) {
  const doc = await io.readBinary(await source(name, url));
  // Some sources prefix every clip with its armature ("CharacterArmature|Walk").
  for (const anim of doc.getRoot().listAnimations()) {
    const short = anim.getName().replace(/^.*\|/, "");
    if (!doc.getRoot().listAnimations().some((a) => a !== anim && a.getName() === short)) anim.setName(short);
  }
  const keep = new Set(clips);
  for (const anim of doc.getRoot().listAnimations()) if (!keep.has(anim.getName())) anim.dispose();
  const missing = clips.filter((c) => !doc.getRoot().listAnimations().some((a) => a.getName() === c));
  if (missing.length) throw new Error(`${name}: no clip named ${missing.join(", ")}`);

  await doc.transform(dedup(), resample(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const file = path.join(out, `${name}.glb`);
  await writeFile(file, await io.writeBinary(doc));
  const { size } = await stat(file);
  console.log(`  ${name.padEnd(6)} ${(size / 1024).toFixed(0).padStart(4)} KB  ${clips.join(", ")}`);
}
