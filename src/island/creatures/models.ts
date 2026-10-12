import {
  AnimationMixer, Box3, Group, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, Quaternion, Vector3,
  type AnimationAction, type AnimationClip, type Bone, type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

/* The animal models, and the rig that plays their animations.

   Models are CC0 glTFs by Quaternius, built into public/models by
   tools/models.mjs (credits in public/models/CREDITS.md). They load after
   the island is already on screen; the animals walk on when they arrive. */

export type ModelName = "deer" | "stag" | "fox" | "husky" | "farmer" | "woman";
export interface Template { scene: Object3D; clips: AnimationClip[] }

export async function loadModels(): Promise<Record<ModelName, Template>> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const names: ModelName[] = ["deer", "stag", "fox", "husky", "farmer", "woman"];
  const loaded = await Promise.all(names.map((n) => loader.loadAsync(`/models/${n}.glb`)));
  const out = {} as Record<ModelName, Template>;
  names.forEach((n, i) => {
    const gltf = loaded[i];
    gltf.scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // a skinned mesh's bounds are its bind pose
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (mat instanceof MeshStandardMaterial) { mat.roughness = 0.85; mat.metalness = 0; }
      }
    });
    out[n] = { scene: gltf.scene, clips: gltf.animations };
  });
  return out;
}

/**
 * A placed copy of a model with its own animation mixer.
 * `root` faces +x, stands on y = 0, and is `height` tall.
 */
export class Rig {
  readonly root = new Group();
  private mixer: AnimationMixer;
  private actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;
  private currentName = "";

  constructor(template: Template, height: number) {
    const model = clone(template.scene);
    // glTF faces +z; the island's animals face +x.
    model.rotation.y = Math.PI / 2;
    this.root.add(model);
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model, true), size = box.getSize(new Vector3());
    const k = height / (size.y || 1);
    model.scale.multiplyScalar(k);
    model.position.y = -box.min.y * k;

    this.mixer = new AnimationMixer(model);
    for (const clip of template.clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    // Animals of a kind shouldn't step in time with each other.
    this.mixer.setTime(Math.random() * 3);
  }

  /** Crossfades to a looping clip, at a speed. Repeated calls only change the speed. */
  play(name: string, speed = 1, fade = 0.4) {
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = speed;
    if (this.currentName === name) return;
    next.reset().setLoop(LoopRepeat, Infinity).play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
    this.currentName = name;
  }

  /** Plays a clip once, then crossfades into `then`. */
  once(name: string, then: string, speed = 1, fade = 0.2) {
    const a = this.actions.get(name);
    if (!a) return this.play(then, speed);
    a.reset().setLoop(LoopOnce, 1).play();
    a.clampWhenFinished = true;
    a.timeScale = speed;
    if (this.current) a.crossFadeFrom(this.current, fade, false);
    this.current = a;
    this.currentName = name;
    const done = (e: { action: AnimationAction }) => {
      if (e.action !== a) return;
      this.mixer.removeEventListener("finished", done);
      if (this.currentName === name) this.play(then, speed, 0.25);
    };
    this.mixer.addEventListener("finished", done);
  }

  get playing() { return this.currentName; }

  /** A bone by name, for posing over the animation. */
  bone(name: string) {
    let found: Bone | undefined;
    this.root.traverse((o) => { if (!found && (o as Bone).isBone && o.name === name) found = o as Bone; });
    return found;
  }

  update(dt: number) { this.mixer.update(dt); }
}

const qa = new Quaternion(), qw = new Quaternion(), local = new Vector3();

/**
 * Turns a bone about an axis given in the world (the body's side-to-side
 * axis, its forward axis, or up), whatever way the bone's own axes happen
 * to point — the rig's are at an angle to the body, so a fixed one won't do.
 * About `side`, negative swings it forward.
 */
export function bend(bone: Object3D | undefined, axis: Vector3, angle: number) {
  if (!bone) return;
  bone.getWorldQuaternion(qw);
  local.copy(axis).applyQuaternion(qw.invert()).normalize();
  bone.quaternion.multiply(qa.setFromAxisAngle(local, angle));
}

/**
 * The resting turn of each of a rig's bones that are posed over its
 * animation, to put back before each frame's animation: the clips don't
 * all move every bone, and a bend applied to one they leave alone would
 * build up frame after frame.
 */
export function restPose(rig: Rig, names: string[]) {
  const bones: Record<string, Bone | undefined> = {}, rest = new Map<Bone, Quaternion>();
  for (const n of names) {
    const bone = rig.bone(n);
    bones[n] = bone;
    if (bone) rest.set(bone, bone.quaternion.clone());
  }
  return { bones, reset() { for (const [bone, q] of rest) bone.quaternion.copy(q); } };
}
