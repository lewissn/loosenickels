import { Color, Mesh, MeshStandardMaterial, PlaneGeometry, RingGeometry, type Scene } from "three";
import { smooth } from "./noise";
import type { Detail } from "./detail";

/* A rippling sea around the island, and a flat far sea out to the horizon
   so the edge of the moving water never shows. The seabed is painted on
   the terrain and seen through it. */

const COLOUR = { night: new Color(0x12304a), dusk: new Color(0x4a7f9a), day: new Color(0x3a9fb5) };

export function createWater(scene: Scene, detail: Detail) {
  const seg = detail.waterSegments;
  const geo = new PlaneGeometry(600, 600, seg, seg).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position;
  const material = new MeshStandardMaterial({ color: 0x3a9fb5, transparent: true, opacity: 0.84, roughness: 0.18, metalness: 0.05, flatShading: true });

  const near = new Mesh(geo, material);
  near.receiveShadow = true;
  const far = new Mesh(new RingGeometry(292, 5000, 96).rotateX(-Math.PI / 2), material);
  far.position.y = -0.05;
  scene.add(near, far);

  function update(t: number, elev: number) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.08 + t * 1.1) * 0.32 + Math.cos(z * 0.07 + t * 0.9) * 0.28 + Math.sin((x + z) * 0.15 + t * 1.7) * 0.1);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    if (elev > 0) material.color.copy(COLOUR.dusk).lerp(COLOUR.day, smooth(0, 0.3, elev));
    else material.color.copy(COLOUR.night).lerp(COLOUR.dusk, smooth(-0.22, 0, elev));
  }

  return { update };
}
