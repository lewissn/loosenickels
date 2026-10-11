import { BoxGeometry, ConeGeometry, Group, IcosahedronGeometry, Mesh, type Material } from "three";
import { mat } from "../materials";

/* The animals' bodies, built from boxes and low-poly blobs, with the joints
   the behaviour code moves: a deer's neck and legs, a rabbit's head, a
   bird's wings. */

export function bodyMaterials() {
  return {
    deer: mat(0x8a5a3a), deerLight: mat(0xd9c3a2), dark: mat(0x2e2420), antler: mat(0xd9c9a8),
    rabbit: mat(0x9b8b78), white: mat(0xf4f1ea), bird: mat(0x3a3530), gull: mat(0xf2f1ec),
    fox: mat(0xc8612a), foxPale: mat(0xf0e6d8), foxDark: mat(0x2a201c),
  };
}
export type BodyMaterials = ReturnType<typeof bodyMaterials>;

function box(w: number, h: number, d: number, material: Material, x: number, y: number, z: number, parent: Group) {
  const m = new Mesh(new BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export interface DeerBody { root: Group; body: Group; neck: Group; legs: Group[] }

export function makeDeer(m: BodyMaterials, stag: boolean): DeerBody {
  const { deer: deerMat, deerLight, dark: darkMat, antler: antlerMat } = m;
  const root = new Group(), body = new Group();
  root.add(body);
  box(2.1, 0.95, 0.85, deerMat, 0, 1.75, 0, body);
  box(0.2, 0.35, 0.22, deerLight, -1.1, 1.95, 0, body);
  const neck = new Group();
  neck.position.set(0.85, 2.0, 0);
  body.add(neck);
  box(0.38, 1.1, 0.38, deerMat, 0.18, 0.45, 0, neck).rotation.z = -0.35;
  const head = new Group();
  head.position.set(0.42, 1.0, 0);
  neck.add(head);
  box(0.75, 0.4, 0.38, deerMat, 0.25, 0, 0, head);
  box(0.2, 0.2, 0.26, darkMat, 0.62, -0.05, 0, head);
  box(0.1, 0.34, 0.08, deerMat, -0.05, 0.3, 0.2, head).rotation.x = 0.45;
  box(0.1, 0.34, 0.08, deerMat, -0.05, 0.3, -0.2, head).rotation.x = -0.45;
  if (stag) {
    for (const side of [1, -1]) {
      box(0.07, 0.85, 0.07, antlerMat, 0, 0.6, 0.13 * side, head).rotation.x = 0.35 * side;
      box(0.06, 0.4, 0.06, antlerMat, 0.15, 0.85, 0.22 * side, head).rotation.z = -0.6;
      box(0.06, 0.35, 0.06, antlerMat, -0.12, 0.95, 0.27 * side, head).rotation.z = 0.5;
    }
  }
  const legs: Group[] = [];
  for (const [x, z] of [[0.8, 0.3], [0.8, -0.3], [-0.8, 0.3], [-0.8, -0.3]] as const) {
    const pivot = new Group();
    pivot.position.set(x, 1.35, z);
    body.add(pivot);
    box(0.17, 1.35, 0.17, deerMat, 0, -0.67, 0, pivot);
    box(0.19, 0.14, 0.19, darkMat, 0, -1.3, 0, pivot);
    legs.push(pivot);
  }
  return { root, body, neck, legs };
}

export interface RabbitBody { root: Group; body: Group; head: Mesh }

export function makeRabbit(m: BodyMaterials): RabbitBody {
  const { rabbit: rabbitMat, white: whiteMat } = m;
  const root = new Group(), body = new Group();
  root.add(body);
  const torso = new Mesh(new IcosahedronGeometry(0.42, 0), rabbitMat);
  torso.scale.set(1.3, 0.95, 0.95);
  torso.position.y = 0.42;
  torso.castShadow = true;
  body.add(torso);
  const head = new Mesh(new IcosahedronGeometry(0.27, 0), rabbitMat);
  head.position.set(0.45, 0.72, 0);
  head.castShadow = true;
  body.add(head);
  for (const side of [1, -1]) box(0.08, 0.42, 0.12, rabbitMat, 0.38, 1.08, 0.09 * side, body).rotation.set(0.15 * side, 0, 0.25);
  const tail = new Mesh(new IcosahedronGeometry(0.13, 0), whiteMat);
  tail.position.set(-0.55, 0.5, 0);
  body.add(tail);
  return { root, body, head };
}

export interface FoxBody { root: Group; body: Group; head: Group; tail: Group; legs: Group[] }

/** Faces +x, like the deer. The head and tail are joints, so the fox can
    crouch to stalk, stretch out to run, and curl up nose-to-tail. */
export function makeFox(m: BodyMaterials): FoxBody {
  const { fox, foxPale, foxDark } = m;
  const root = new Group(), body = new Group();
  root.add(body);
  box(1.15, 0.4, 0.38, fox, 0, 0.8, 0, body);
  box(0.5, 0.2, 0.3, foxPale, 0.3, 0.64, 0, body);

  const head = new Group();
  head.position.set(0.62, 0.95, 0);
  body.add(head);
  box(0.36, 0.32, 0.34, fox, 0.08, 0, 0, head);
  box(0.3, 0.14, 0.16, foxPale, 0.36, -0.07, 0, head);
  box(0.06, 0.07, 0.08, foxDark, 0.52, -0.04, 0, head);
  for (const side of [1, -1]) {
    const ear = new Mesh(new ConeGeometry(0.08, 0.22, 4), fox);
    ear.position.set(0.0, 0.25, 0.1 * side);
    ear.castShadow = true;
    head.add(ear);
  }

  const tail = new Group();
  tail.position.set(-0.55, 0.88, 0);
  body.add(tail);
  box(0.62, 0.22, 0.22, fox, -0.3, 0, 0, tail);
  box(0.2, 0.18, 0.18, foxPale, -0.7, 0, 0, tail);

  const legs: Group[] = [];
  for (const [x, z] of [[0.42, 0.13], [0.42, -0.13], [-0.42, 0.13], [-0.42, -0.13]] as const) {
    const pivot = new Group();
    pivot.position.set(x, 0.66, z);
    body.add(pivot);
    box(0.1, 0.5, 0.1, fox, 0, -0.25, 0, pivot);
    box(0.11, 0.16, 0.11, foxDark, 0, -0.58, 0, pivot);
    legs.push(pivot);
  }
  return { root, body, head, tail, legs };
}

export interface BirdBody { root: Group; wings: Mesh[] }

export function makeBird(material: Material): BirdBody {
  const root = new Group();
  const body = new Mesh(new ConeGeometry(0.18, 0.9, 4).rotateZ(-Math.PI / 2), material);
  body.castShadow = true;
  root.add(body);
  const wings = [1, -1].map((side) => {
    const w = new Mesh(new BoxGeometry(0.42, 0.04, 1.1).translate(0, 0, 0.55 * side), material);
    w.castShadow = true;
    root.add(w);
    return w;
  });
  return { root, wings };
}
