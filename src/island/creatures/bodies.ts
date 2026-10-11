import { BoxGeometry, ConeGeometry, Group, IcosahedronGeometry, Mesh, type Material } from "three";
import { mat } from "../materials";

/* The bodies of the animals that aren't models (see models.ts), with the
   joints the behaviour code moves: a rabbit's head, a bird's wings. */

export function bodyMaterials() {
  return {
    rabbit: mat(0x9b8b78), white: mat(0xf4f1ea), bird: mat(0x3a3530), gull: mat(0xf2f1ec),
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
