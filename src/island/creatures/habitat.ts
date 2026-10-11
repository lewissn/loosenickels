import { Mesh, MeshBasicMaterial, SphereGeometry, type Camera, type Object3D, type Scene, type Vector3 } from "three";
import type { Season } from "../seasons";
import type { World } from "../world";

/* What every creature lives in and answers to. */

export interface Creature {
  kind: "deer" | "rabbit" | "fox" | "bird" | "gull";
  /** For the caption: "following a stag". */
  label(): string;
  /** Where the camera looks when following. */
  focus(): Vector3;
}

export interface Env {
  /** The sun's elevation, -1 to 1. Below zero is night. */
  elev: number;
}

export interface Habitat {
  scene: Scene;
  world: World;
  camera: Camera;
  season: Season;
  /** Invisible spheres the tap ray is cast against. */
  hitboxes: Mesh[];
}

const hitMat = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** A generous invisible tap target, so small animals can be caught on a phone. */
export function addHitbox(habitat: Habitat, root: Object3D, r: number, y: number, creature: Creature) {
  const h = new Mesh(new SphereGeometry(r, 8, 6), hitMat);
  h.position.y = y;
  h.userData.creature = creature;
  root.add(h);
  habitat.hitboxes.push(h);
}
