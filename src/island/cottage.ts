import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ExtrudeGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial,
  PointLight, Points, Shape, ShaderMaterial, Vector2, Vector3, type Material, type Scene,
} from "three";
import { smooth } from "./noise";
import { softDot } from "./materials";
import { NOISE_GLSL } from "./shared";
import type { Shared } from "./shared";
import type { World } from "./world";

/* A cottage on flat ground above the shore, facing the sea.

   Somebody lives here, though you never see them: the kitchen light comes
   on at dusk, the bedroom later, and the house goes dark in the small
   hours until the kitchen lights again for breakfast. A lantern by the
   door burns all night and lights the ground, and the chimney smokes. */

const W = 6.2, D = 4.4, H = 2.7, BASE = 0.45;
/** Where the garden and bench are, in the cottage's own coordinates. */
const GARDEN = { x: -5.2, z: 3.4 }, BENCH = { x: 3.6, z: 4.6 };

/** When each room is lit, as spans of the day (0 is midnight). */
const ROOMS: Record<string, [number, number][]> = {
  kitchen: [[0.735, 0.93], [0.205, 0.29]],
  bedroom: [[0.84, 0.995]],
  back: [[0.75, 0.885]],
};

const WINDOW_LIGHT = new Color(0xffa64a);

/** 1 inside any span, easing over ~0.004 of a day (a couple of seconds). */
function lit(dayF: number, spans: [number, number][]) {
  let v = 0;
  for (const [a, b] of spans) v = Math.max(v, smooth(a, a + 0.004, dayF) * (1 - smooth(b, b + 0.004, dayF)));
  return v;
}

function roofShape(halfWidth: number, rise: number) {
  const s = new Shape();
  s.moveTo(-halfWidth, 0);
  s.lineTo(halfWidth, 0);
  s.lineTo(0, rise);
  s.closePath();
  return s;
}

const smokeVertex = /* glsl */ `
attribute float aI;
uniform float uTime, uAmount;
uniform vec2 uDrift;
varying float vAlpha;
void main() {
  float age = fract(uTime * 0.075 + aI);
  vec3 p = position;
  p.y += age * 8.0;
  p.xz += uDrift * age * age * 7.0 + vec2(sin(uTime * 0.7 + aI * 20.0), cos(uTime * 0.5 + aI * 13.0)) * age * 0.8;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.2 + age * 5.5) * 320.0 / -mv.z;
  vAlpha = smoothstep(0.0, 0.08, age) * (1.0 - age) * 0.32 * uAmount;
}
`;

const smokeFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type CottageSpots = ReturnType<typeof createCottage>["spots"];

export function createCottage(scene: Scene, world: World, shared: Shared) {
  const { site } = world;
  const house = new Group();
  house.position.set(site.x, site.y, site.z);
  // Local +z is the front; turn it to face the sea.
  house.rotation.y = Math.PI / 2 - site.facing;

  const std = (color: number, roughness = 0.9) => new MeshStandardMaterial({ color, roughness, metalness: 0 });
  const stone = std(0x8c867c), plaster = std(0xf3e4c4, 0.95), timber = std(0x4b3627), thatch = std(0xb08a55, 1);
  // Thatch: straw streaks running down the slope, darker at the eaves,
  // a paler ridge. Worked out in the roof's own coordinates.
  thatch.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vLocal;\n${NOISE_GLSL}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float along = vLocal.x * 9.0, down = vLocal.y * 1.4 + abs(vLocal.z) * 1.4;
        float straw = vnoise(vec2(along, down)) * 0.6 + vnoise(vec2(along * 2.7, down * 2.0)) * 0.4;
        diffuseColor.rgb *= 0.72 + straw * 0.42;
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.9, vLocal.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.12, 1.0), smoothstep(${(2.3 + 0.35 - 0.35).toFixed(2)}, ${(2.3 + 0.35).toFixed(2)}, vLocal.y));`);
  };
  const door = std(0x5d3d27, 0.8);
  const add = (geo: BufferGeometry, material: Material, x: number, y: number, z: number, ry = 0) => {
    const m = new Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    house.add(m);
    return m;
  };

  // Footing, walls, timber frame.
  add(new BoxGeometry(W + 0.35, 1.4, D + 0.35), stone, 0, BASE - 0.7, 0);
  add(new BoxGeometry(W, H, D), plaster, 0, BASE + H / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new BoxGeometry(0.24, H, 0.24), timber, (sx * W) / 2, BASE + H / 2, (sz * D) / 2);
  for (const sz of [-1, 1]) add(new BoxGeometry(W + 0.1, 0.22, 0.26), timber, 0, BASE + H - 0.1, (sz * D) / 2);

  // Gables, and a thick thatched roof with deep eaves, ridge along x.
  const rise = 2.3;
  const gable = new ExtrudeGeometry(roofShape(D / 2, rise * 0.92), { depth: 0.2, bevelEnabled: false }).rotateY(Math.PI / 2);
  add(gable, plaster, -W / 2, BASE + H, 0);
  add(gable.clone(), plaster, W / 2 - 0.2, BASE + H, 0);
  const roof = new ExtrudeGeometry(roofShape(D / 2 + 0.75, rise + 0.35), {
    depth: W + 1.0, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.2, bevelSegments: 3, curveSegments: 2,
  }).translate(0, 0, -(W + 1.0) / 2).rotateY(Math.PI / 2);
  add(roof, thatch, 0, BASE + H - 0.2, 0);
  add(new BoxGeometry(0.9, 3.6, 0.9), stone, W / 2 - 0.9, BASE + H + 2.0, -0.7);
  add(new BoxGeometry(1.05, 0.2, 1.05), stone, W / 2 - 0.9, BASE + H + 3.8, -0.7);

  // Door and windows. Each room's glass is its own material, lit on its own.
  add(new BoxGeometry(1.0, 2.0, 0.12), timber, 0.7, BASE + 1.0, D / 2 + 0.02);
  add(new BoxGeometry(0.82, 1.85, 0.12), door, 0.7, BASE + 0.95, D / 2 + 0.05);
  const glass = Object.fromEntries(Object.keys(ROOMS).map((room) => [
    room, new MeshStandardMaterial({ color: 0x1b2430, roughness: 0.15, metalness: 0, emissive: WINDOW_LIGHT, emissiveIntensity: 0 }),
  ])) as Record<keyof typeof ROOMS, MeshStandardMaterial>;
  const pane = (room: string, x: number, z: number, ry: number) => {
    add(new BoxGeometry(1.08, 1.08, 0.14), timber, x, BASE + 1.55, z, ry);
    add(new BoxGeometry(0.86, 0.86, 0.16), glass[room], x, BASE + 1.55, z, ry);
  };
  pane("kitchen", -1.6, D / 2 + 0.01, 0);
  pane("bedroom", 2.2, D / 2 + 0.01, 0);
  pane("kitchen", -W / 2 - 0.01, 0, Math.PI / 2);
  pane("bedroom", W / 2 + 0.01, 0.4, Math.PI / 2);
  pane("back", -0.4, -D / 2 - 0.01, 0);

  // The lantern by the door, and the light it throws.
  const lanternGlass = new MeshStandardMaterial({ color: 0x2a2018, emissive: WINDOW_LIGHT, emissiveIntensity: 0 });
  add(new BoxGeometry(0.3, 0.42, 0.3), lanternGlass, 1.55, BASE + 2.1, D / 2 + 0.25);
  const lamp = new PointLight(0xffa456, 0, 18, 2);
  lamp.position.set(1.0, BASE + 2.0, D / 2 + 1.3);
  house.add(lamp);

  // A vegetable patch to one side, and a bench facing the sea.
  const soil = std(0x5a4330, 1), leaf = std(0x5f8f3e, 0.9), wood = std(0x7a5a3e, 0.85);
  // Deep enough to sit into the slope rather than float over it.
  add(new BoxGeometry(2.8, 1.2, 2.2), soil, GARDEN.x, -0.52, GARDEN.z);
  const plants: Mesh[] = [];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5; i++) {
      const p = add(new IcosahedronGeometry(0.17, 1), leaf, GARDEN.x - 1.1 + i * 0.55, 0.16, GARDEN.z - 0.7 + row * 0.7);
      p.scale.set(1, 0.7, 1);
      plants.push(p);
    }
  }
  add(new BoxGeometry(1.7, 0.08, 0.48), wood, BENCH.x, 0.47, BENCH.z);
  add(new BoxGeometry(1.7, 0.42, 0.07), wood, BENCH.x, 0.82, BENCH.z - 0.24);
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.17, 0.17]) add(new BoxGeometry(0.08, 0.47, 0.08), wood, BENCH.x + sx, 0.23, BENCH.z + sz);
  scene.add(house);
  house.updateMatrixWorld(true);

  // Chimney smoke: soft points that rise, spread and drift downwind.
  const n = 22;
  const smokeGeo = new BufferGeometry();
  const top = house.localToWorld(new Vector3(W / 2 - 0.9, BASE + H + 3.9, -0.7));
  smokeGeo.setAttribute("position", new BufferAttribute(new Float32Array(Array.from({ length: n }, () => [top.x, top.y, top.z]).flat()), 3));
  smokeGeo.setAttribute("aI", new BufferAttribute(new Float32Array(Array.from({ length: n }, (_, i) => i / n)), 1));
  const smokeColor = new Color();
  const smokeMat = new ShaderMaterial({
    vertexShader: smokeVertex,
    fragmentShader: smokeFragment,
    uniforms: {
      uTime: shared.uTime, uMap: { value: softDot() }, uColor: { value: smokeColor },
      // Downwind, matching the gusts in shared.ts.
      uAmount: { value: 1 }, uDrift: { value: new Vector2(0.8, 0.6) },
    },
    transparent: true, depthWrite: false,
  });
  const smoke = new Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  scene.add(smoke);

  // Places someone living here would go, in world coordinates, with the
  // heading to face when there (forward is (cos h, -sin h), as for animals).
  const at = (x: number, z: number) => house.localToWorld(new Vector3(x, 0, z));
  const facing = (dx: number, dz: number) => {
    const d = at(dx, dz).sub(at(0, 0));
    return Math.atan2(-d.z, d.x);
  };
  const seaward = facing(0, 1);
  let lookout = at(0.7, 9);
  for (let d = 9; d < 24; d += 0.5) {
    const p = at(0.7, d);
    if (world.height(p.x, p.z) < 1.0) break;
    lookout = p;
  }
  // What you can't walk through: the house (with its footing) and the bench.
  const toLocal = house.matrixWorld.clone().invert(), probe = new Vector3();
  const blocks = (x: number, z: number) => {
    probe.set(x, site.y, z).applyMatrix4(toLocal);
    const inHouse = Math.abs(probe.x) < W / 2 + 0.45 && Math.abs(probe.z) < D / 2 + 0.45;
    const onBench = Math.abs(probe.x - BENCH.x) < 0.95 && Math.abs(probe.z - BENCH.z) < 0.35;
    return inHouse || onBench;
  };

  // What the camera can't enter: walls, and the roof with its deep eaves.
  const solid = (x: number, y: number, z: number) => {
    probe.set(x, y, z).applyMatrix4(toLocal);
    if (probe.y < BASE + H - 0.3) return Math.abs(probe.x) < W / 2 + 0.45 && Math.abs(probe.z) < D / 2 + 0.45;
    return probe.y < BASE + H + rise + 0.6 && Math.abs(probe.x) < W / 2 + 0.9 && Math.abs(probe.z) < D / 2 + 1.25;
  };

  const spots = {
    blocks,
    solid,
    door: at(0.7, D / 2 + 0.7),
    garden: { at: at(GARDEN.x + 1.9, GARDEN.z), face: facing(-1, 0) },
    // Where a sitter's hips go (on the seat, just in front of the back), and
    // the height of the top of the seat.
    bench: { at: at(BENCH.x, BENCH.z - 0.08), face: seaward, seat: site.y + 0.51 },
    lookout: { at: lookout, face: seaward },
  };

  function update(dayF: number, t: number) {
    const night = shared.uNight.value;
    const flicker = 0.93 + Math.sin(t * 9.1) * 0.03 + Math.sin(t * 23.7) * 0.025 + Math.sin(t * 3.3) * 0.02;
    let glow = 0;
    for (const room of Object.keys(ROOMS)) {
      const v = lit(dayF, ROOMS[room]);
      glow = Math.max(glow, v);
      glass[room].emissiveIntensity = v * 2.6 * flicker;
    }
    const lantern = smooth(0.15, 0.5, night);
    lanternGlass.emissiveIntensity = lantern * 3.2 * flicker;
    lamp.intensity = (lantern * 14 + glow * 6) * flicker;
    // Smoke takes the light of the sky; there's more of it on cold evenings.
    smokeColor.copy(shared.uSkyHorizon.value).lerp(shared.uSunColor.value, 0.3).multiplyScalar(0.9).addScalar(0.08);
    smokeMat.uniforms.uAmount.value = 0.55 + 0.45 * Math.max(glow, shared.uSnow.value);
    // The garden dies back in winter.
    for (const p of plants) p.scale.set(1 - shared.uSnow.value * 0.8, 0.7 * (1 - shared.uSnow.value * 0.8), 1 - shared.uSnow.value * 0.8);
  }

  return { update, spots };
}
