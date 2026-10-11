import { BufferAttribute, Color, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { clamp01, smooth } from "./noise";
import type { Detail } from "./detail";
import type { Season } from "./seasons";
import type { World } from "./world";

/* Flat-shaded terrain with one colour per face.

   Faces are measured once (height, steepness, a little noise) and then
   repainted whenever the season moves far enough to show. */

export const SNOW = new Color(0xf2f5f8);

const C = {
  seabed: new Color(0x5f8f86), wet: new Color(0xb9a676), sand: new Color(0xdcc893),
  rock: new Color(0x8b857c), rockDark: new Color(0x6a655f),
  meadow: new Color(), out: new Color(),
};

export function createTerrain(world: World, detail: Detail) {
  const seg = detail.terrainSegments;
  const geo = new PlaneGeometry(260, 260, seg, seg).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, world.height(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const faces = pos.count / 3;
  const faceH = new Float32Array(faces), faceNy = new Float32Array(faces), faceN = new Float32Array(faces);
  for (let f = 0; f < faces; f++) {
    const i = f * 3;
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    faceH[f] = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    faceNy[f] = geo.attributes.normal.getY(i);
    faceN[f] = world.noise2(cx * 0.15, cz * 0.15);
  }

  const col = new Float32Array(pos.count * 3);
  geo.setAttribute("color", new BufferAttribute(col, 3));
  const mesh = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  function paint(season: Season) {
    C.meadow.copy(season.grass).offsetHSL(0.02, 0.05, 0.07);
    const snowLine = 33 - season.snow * 31;
    for (let f = 0; f < faces; f++) {
      const h = faceH[f], ny = faceNy[f], n = faceN[f], c = C.out;
      if (h < -1.5) c.copy(C.seabed).lerp(C.wet, smooth(-7, -1.5, h));
      else if (h < 0.9) c.copy(C.wet).lerp(C.sand, smooth(-1.5, 0.6, h));
      else if (ny < 0.78 || h > 30) c.copy(C.rock).lerp(C.rockDark, clamp01(n * 0.5 + 0.5));
      else {
        c.copy(season.grass).lerp(C.meadow, clamp01(n * 0.6 + 0.4)).multiplyScalar(0.92 + n * 0.1);
        if (h < 1.8) c.lerp(C.sand, 1 - smooth(0.9, 1.8, h));
      }
      const sl = snowLine + n * 4;
      if (h > sl && ny > 0.5) c.lerp(SNOW, smooth(sl, sl + 3, h));
      for (let v = 0; v < 3; v++) {
        const o = (f * 3 + v) * 3;
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      }
    }
    geo.attributes.color.needsUpdate = true;
  }

  return { mesh, paint };
}
