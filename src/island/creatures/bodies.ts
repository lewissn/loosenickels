import {
  BufferGeometry, CapsuleGeometry, Color, ConeGeometry, DoubleSide, Group, Mesh,
  MeshStandardMaterial, Shape, ShapeGeometry, SphereGeometry, type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { lump, shade } from "../shapes";
import { smooth } from "../noise";

/* The rabbits, birds and the bear, which are made here rather than loaded
   (see models.ts for the deer, fox and dog): soft rounded bodies in the same
   style as the trees, with the joints their behaviour moves — a rabbit's
   haunches, feet, head and ears; a bird's wings at shoulder and wrist, and
   its tail; a bear's four legs, its head, and its hips, to sit and rear on.
   Each part is shaded in its vertex colours, darker underneath. */

/**
 * Light shows through thin feathers, so a wing seen from below should look
 * pale rather than dark: both faces are lit as the upper one is.
 */
function litBothSides(material: MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\nnormal = normalize(vNormal);",
    );
  };
  return material;
}

export function bodyMaterials() {
  const std = (color: number, extra: Partial<MeshStandardMaterial> = {}) =>
    Object.assign(new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, vertexColors: true }), extra);
  return {
    /** The rabbit's coat; its colour turns white in winter (see COAT). */
    rabbit: std(0x8e7a64),
    white: std(0xf3efe6),
    nose: std(0xc98a86),
    eye: new MeshStandardMaterial({ color: 0x15100e, roughness: 0.15, metalness: 0 }),
    swallow: std(0x1f2a44, { roughness: 0.55 }),
    swallowBelly: std(0xf1e8da),
    swallowThroat: std(0x9c3c26),
    swallowWing: std(0x1f2a44, { side: DoubleSide, roughness: 0.55 }),
    gull: std(0xf4f3ef),
    gullTail: litBothSides(std(0xf4f3ef, { side: DoubleSide })),
    gullWing: litBothSides(std(0xb4bdc6, { side: DoubleSide })),
    beak: std(0x2a2522),
    gullBeak: std(0xf0bf47),
    bear: std(0x5e412b, { roughness: 0.95 }),
    muzzle: std(0x9a7656, { roughness: 0.9 }),
  };
}
export type BodyMaterials = ReturnType<typeof bodyMaterials>;

/** Colour of a rabbit's coat in summer and in winter. */
export const COAT = { summer: new Color(0x8e7a64), winter: new Color(0xf0eee8) };

/** Shading: lighter on top, darker underneath, as a vertex colour. */
const underside = (g: BufferGeometry, lo: number, hi: number, dark = 0.62) =>
  shade(g, (_x, y) => dark + (1 - dark) * smooth(lo, hi, y));

function part(geo: BufferGeometry, material: Material, parent: Group, x = 0, y = 0, z = 0) {
  const m = new Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** A smooth lump, scaled and placed, shaded underneath, ready to merge. */
const blob = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, salt: number, rough = 0.05) =>
  underside(lump(r, 2, rough, salt).scale(sx, sy, sz).translate(x, y, z), y - r * sy, y + r * sy);

const capsule = (r: number, len: number) => {
  const g = new CapsuleGeometry(r, len, 3, 8);
  g.deleteAttribute("uv");
  return underside(g, -len / 2 - r, len / 2 + r, 0.75);
};

const sphere = (r: number) => {
  const g = new SphereGeometry(r, 10, 8);
  g.deleteAttribute("uv");
  return shade(g, () => 1);
};

const cone = (r: number, h: number) => {
  const g = new ConeGeometry(r, h, 6).rotateZ(-Math.PI / 2);
  g.deleteAttribute("uv");
  return shade(g, () => 1);
};

// ---------------------------------------------------------------- rabbits

export type RabbitMood = "graze" | "hop" | "flee" | "alert";

/** A rabbit, facing +x, about a unit long and nearly as tall to its ear tips. */
export class RabbitBody {
  readonly root = new Group();
  private body = new Group();
  private head = new Group();
  private ears: Group[] = [];
  private front: Group[] = [];
  private hind: Group[] = [];
  private twitch = 0;
  private nextTwitch = Math.random() * 3;
  private seed = Math.random() * 10;

  constructor(m: BodyMaterials) {
    const { rabbit: fur, white, nose, eye } = m;
    this.root.add(this.body);
    const salt = Math.random() * 100;
    part(mergeGeometries([
      blob(0.34, 1.35, 0.95, 0.9, 0, 0.36, 0, salt),
      blob(0.24, 1, 1, 1, -0.17, 0.3, 0.15, salt + 1),
      blob(0.24, 1, 1, 1, -0.17, 0.3, -0.15, salt + 2),
      blob(0.22, 1, 1, 0.95, 0.22, 0.37, 0, salt + 3),
    ]), fur, this.body);
    part(blob(0.11, 1, 1, 1, -0.45, 0.43, 0, salt + 4, 0.25), white, this.body);

    this.head.position.set(0.34, 0.56, 0);
    this.body.add(this.head);
    part(mergeGeometries([
      blob(0.19, 1.2, 1, 0.95, 0.08, 0.04, 0, salt + 5),
      blob(0.12, 1, 1, 1, 0.15, -0.02, 0.08, salt + 6),
      blob(0.12, 1, 1, 1, 0.15, -0.02, -0.08, salt + 7),
    ]), fur, this.head);
    part(blob(0.085, 1, 0.9, 1, 0.25, -0.05, 0, salt + 8), white, this.head);
    part(sphere(0.026), nose, this.head, 0.325, -0.02, 0);
    for (const side of [1, -1]) part(sphere(0.034), eye, this.head, 0.15, 0.08, 0.125 * side);

    for (const side of [1, -1]) {
      const ear = new Group();
      ear.position.set(0.02, 0.17, 0.075 * side);
      ear.rotation.x = -0.3 * side;
      this.head.add(ear);
      part(capsule(0.055, 0.3).scale(1, 1, 0.45), fur, ear, 0, 0.2, 0);
      this.ears.push(ear);

      const leg = new Group();
      leg.position.set(0.24, 0.22, 0.09 * side);
      this.body.add(leg);
      part(capsule(0.045, 0.14), fur, leg, 0, -0.12, 0);
      this.front.push(leg);

      const foot = new Group();
      foot.position.set(-0.2, 0.13, 0.17 * side);
      this.body.add(foot);
      part(capsule(0.055, 0.2).rotateZ(Math.PI / 2), fur, foot, 0.07, -0.08, 0);
      this.hind.push(foot);
    }
  }

  /**
   * hop is 0–1 through a hop; move is 0–1, how much it's hopping. A hop:
   * push off nose-up from the haunches, arc, reach for the ground with the
   * front feet, land nose-down with a little squash.
   */
  pose(dt: number, t: number, hop: number, move: number, mood: RabbitMood) {
    const k = Math.min(1, dt * 8);
    const ease = (from: number, to: number, rate = k) => from + (to - from) * rate;
    const arc = Math.sin(Math.PI * hop) * move;
    const height = mood === "flee" ? 0.6 : 0.38;
    const alert = mood === "alert" ? 1 : 0;

    this.body.position.y = ease(this.body.position.y, arc * height + alert * 0.06, move > 0.5 ? 1 : k);
    const pitch = Math.cos(Math.PI * hop) * 0.3 * move + alert * 0.55;
    this.body.rotation.z = ease(this.body.rotation.z, pitch, move > 0.5 ? 1 : k);
    const squash = 1 - 0.1 * move * (1 - smooth(0, 0.2, arc));
    this.body.scale.set(1 + (1 - squash) * 0.5, squash, 1);

    for (const f of this.hind) f.rotation.z = -Math.sin(Math.PI * hop) * 0.9 * move - alert * 0.2;
    for (const l of this.front) l.rotation.z = Math.sin(Math.PI * hop + 0.6) * 0.8 * move + alert * 0.5;

    // Grazing rabbits nibble in bouts; alert ones hold their heads high.
    const nibbling = mood === "graze" && Math.sin(t * 0.7 + this.seed) > -0.2;
    const headPitch = nibbling ? -0.55 + Math.sin(t * 9) * 0.06 : alert ? 0.25 - pitch * 0.6 : -pitch * 0.5;
    this.head.rotation.z = ease(this.head.rotation.z, headPitch);

    // Ears: up when alert, laid back in flight, with the odd twitch.
    this.nextTwitch -= dt;
    if (this.nextTwitch <= 0) { this.twitch = 1; this.nextTwitch = 1.5 + Math.random() * 4; }
    this.twitch = Math.max(0, this.twitch - dt * 5);
    const earBase = mood === "flee" ? 1.0 : alert ? 0.0 : 0.3;
    this.ears.forEach((e, i) => {
      e.rotation.z = ease(e.rotation.z, earBase + (i === 0 ? this.twitch * 0.35 : 0) + arc * 0.3, Math.min(1, k * 1.5));
    });
  }
}

// ---------------------------------------------------------------- birds

export type BirdKind = "swallow" | "gull";

/** An outline in (chord, span) as a flat shape in the xz plane, span along +z. */
function flat(points: [number, number][], tipFrom = Infinity) {
  const s = new Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  s.closePath();
  // Lay it flat with its face (and normal) upward, span along +z.
  const g = new ShapeGeometry(s).rotateX(-Math.PI / 2).scale(1, 1, -1);
  g.deleteAttribute("uv");
  // Black wingtips, for the gull: dark past `tipFrom` along the span.
  return shade(g, (_x, _y, z) => (z >= tipFrom ? 0.12 : 1));
}

const mirror = (g: BufferGeometry) => g.clone().scale(1, 1, -1);

interface Plan { size: number; span: number; tip: number; inner: [number, number][]; outer: [number, number][] }
const PLANS: Record<BirdKind, Plan> = {
  // Long, narrow, swept-back wings.
  swallow: {
    size: 1, span: 0.26, tip: Infinity,
    inner: [[0.08, 0], [0.06, 0.27], [-0.05, 0.27], [-0.09, 0]],
    outer: [[0.06, 0], [-0.02, 0.26], [-0.2, 0.46], [-0.09, 0.2], [-0.05, 0]],
  },
  // Broad wings with a long hand and black tips.
  gull: {
    size: 1.45, span: 0.32, tip: 0.24,
    inner: [[0.1, 0], [0.08, 0.33], [-0.09, 0.33], [-0.12, 0]],
    outer: [[0.08, 0], [0.02, 0.24], [-0.1, 0.44], [-0.13, 0.24], [-0.09, 0]],
  },
};

/** A bird, facing +x, its wings jointed at the shoulder and the wrist. */
export class BirdBody {
  readonly root = new Group();
  private body = new Group();
  private wings: { inner: Group; outer: Group; side: number }[] = [];
  private tail: Mesh;

  constructor(readonly kind: BirdKind, m: BodyMaterials) {
    const plan = PLANS[kind];
    this.root.add(this.body);
    this.body.scale.setScalar(plan.size);
    const salt = Math.random() * 100;
    if (kind === "swallow") {
      part(mergeGeometries([blob(0.12, 2.3, 0.85, 0.9, 0, 0.01, 0, salt), blob(0.09, 1, 1, 1, 0.25, 0.035, 0, salt + 1)]), m.swallow, this.body);
      part(blob(0.105, 2, 0.7, 0.8, 0.02, -0.025, 0, salt + 2), m.swallowBelly, this.body);
      part(blob(0.055, 1, 0.9, 0.9, 0.3, -0.005, 0, salt + 3), m.swallowThroat, this.body);
      part(cone(0.022, 0.06), m.beak, this.body, 0.36, 0.03, 0);
    } else {
      part(mergeGeometries([blob(0.13, 2.1, 0.95, 0.95, 0, 0, 0, salt), blob(0.1, 1.05, 1, 1, 0.24, 0.05, 0, salt + 1)]), m.gull, this.body);
      part(cone(0.022, 0.11), m.gullBeak, this.body, 0.37, 0.04, 0);
    }
    for (const side of [1, -1]) part(sphere(0.018), m.eye, this.body, 0.31, 0.06, 0.06 * side);

    // A forked tail for the swallow; a short fan for the gull.
    this.tail = kind === "swallow"
      ? part(flat([[0, 0.05], [-0.42, 0.11], [-0.24, 0], [-0.42, -0.11], [0, -0.05]]), m.swallowWing, this.body, -0.22, 0.01, 0)
      : part(flat([[0, 0.06], [-0.2, 0.09], [-0.22, 0], [-0.2, -0.09], [0, -0.06]]), m.gullTail, this.body, -0.22, 0.01, 0);

    const wingMat = kind === "swallow" ? m.swallowWing : m.gullWing;
    const innerGeo = flat(plan.inner), outerGeo = flat(plan.outer, plan.tip);
    for (const side of [1, -1]) {
      const inner = new Group();
      inner.position.set(0.04, 0.04, 0.05 * side);
      this.body.add(inner);
      part(side > 0 ? innerGeo : mirror(innerGeo), wingMat, inner);
      const outer = new Group();
      outer.position.z = plan.span * side;
      inner.add(outer);
      part(side > 0 ? outerGeo : mirror(outerGeo), wingMat, outer);
      this.wings.push({ inner, outer, side });
    }
  }

  /**
   * flap is the wingbeat's phase; beat is 0–1, how hard it's flapping (0 is
   * gliding); fold is 0–1 for wings folded at rest; bank and pitch in radians.
   */
  pose(flap: number, beat: number, fold: number, bank: number, pitch: number) {
    this.body.rotation.x = bank;
    this.body.rotation.z = pitch;
    // Gliding: a shallow V for gulls, flat for swallows.
    const dihedral = this.kind === "gull" ? 0.12 : 0.04;
    const up = Math.sin(flap) * 0.85 * beat + dihedral * (1 - beat);
    const hand = Math.sin(flap - 0.8) * 0.6 * beat + dihedral * 0.5 * (1 - beat);
    for (const { inner, outer, side } of this.wings) {
      inner.rotation.set(-side * up * (1 - fold) - side * 0.2 * fold, side * 1.25 * fold, 0);
      outer.rotation.set(-side * hand * (1 - fold), side * 2.2 * fold, 0);
    }
    this.tail.rotation.z = -pitch * 0.5;
    // The tail fans out in turns.
    this.tail.scale.z = 1 + Math.max(0, Math.abs(bank) - 0.2) * 0.8;
  }
}

// ---------------------------------------------------------------- the bear

export type BearPose = "walk" | "forage" | "sit" | "rear" | "sleep";

/** Hip height, standing on all fours. */
const HIP = 0.86;

/**
 * A brown bear, facing +x: about 2.2 long, 1.3 to the top of its shoulder
 * hump. Its body hangs from the hips, so it can sit back on its haunches or
 * rear up on its hind legs by pitching about them.
 */
export class BearBody {
  readonly root = new Group();
  private body = new Group();
  private head = new Group();
  private front: Group[] = [];
  private hind: Group[] = [];
  private phase = Math.random() * 6;
  private pitch = 0;
  private hip = HIP;
  private lie = 0;
  private seed = Math.random() * 10;

  constructor(m: BodyMaterials) {
    const { bear: fur, muzzle, eye, beak: nose } = m;
    this.body.position.set(-0.55, HIP, 0);
    this.root.add(this.body);
    const salt = Math.random() * 100;
    // One long barrel, a rounded rump and the hump over the shoulders; all
    // relative to the hips.
    part(mergeGeometries([
      blob(0.55, 1.6, 0.95, 0.92, 0.45, 0.04, 0, salt, 0.03),
      blob(0.46, 1, 1, 1.02, 0.02, 0.08, 0, salt + 1, 0.03),
      blob(0.32, 1.35, 0.8, 1.1, 0.95, 0.26, 0, salt + 2, 0.04),
    ]), fur, this.body);
    part(blob(0.1, 1, 1, 1, -0.45, 0.18, 0, salt + 4, 0.2), fur, this.body);

    this.head.position.set(1.38, 0.14, 0);
    this.body.add(this.head);
    part(mergeGeometries([
      blob(0.34, 1.1, 0.95, 1.05, 0.12, 0.02, 0, salt + 5, 0.04),
      ...[1, -1].map((side) => blob(0.11, 0.6, 1, 1, 0.0, 0.3, 0.22 * side, salt + 6 + side, 0.08)),
    ]), fur, this.head);
    part(blob(0.17, 1.45, 0.8, 0.95, 0.46, -0.07, 0, salt + 9, 0.04), muzzle, this.head);
    part(sphere(0.06), nose, this.head, 0.7, -0.03, 0);
    for (const side of [1, -1]) part(sphere(0.04), eye, this.head, 0.38, 0.12, 0.17 * side);

    const leg = (group: Group[], x: number, side: number, r: number) => {
      const g = new Group();
      g.position.set(x, -0.08, 0.27 * side);
      this.body.add(g);
      part(capsule(r, 0.52), fur, g, 0, -0.38, 0);
      part(blob(r * 1.1, 1.35, 0.6, 1.05, 0.06, -0.68, 0, salt + 10 + group.length), fur, g);
      group.push(g);
    };
    for (const side of [1, -1]) {
      leg(this.front, 1.02, side, 0.16);
      leg(this.hind, 0.0, side, 0.18);
    }
  }

  /**
   * move is 0–1, how much it's walking; pace how fast (1 is an amble). Each
   * pose eases in from the last.
   */
  pose(dt: number, t: number, pose: BearPose, move: number, pace: number) {
    const k = Math.min(1, dt * 3);
    const ease = (from: number, to: number, rate = k) => from + (to - from) * rate;
    // A slow, rolling walk: diagonal legs together, the weight swaying.
    this.phase += dt * Math.PI * 2 * 0.85 * pace * move;
    const p = this.phase, stride = 0.42 * move;

    const pitch = pose === "rear" ? 1.2 : pose === "sit" ? 0.5 : 0;
    this.pitch = ease(this.pitch, pitch, Math.min(1, dt * (pose === "rear" ? 2.2 : 1.6)));
    const hip = pose === "sleep" || pose === "sit" ? 0.42 : HIP;
    this.hip = ease(this.hip, hip, Math.min(1, dt * 1.5));
    const breathe = Math.sin(t * (pose === "sleep" ? 1.1 : 2.2) + this.seed);

    this.body.position.y = this.hip + Math.abs(Math.sin(p)) * 0.035 * move;
    this.body.rotation.z = this.pitch;
    this.body.rotation.x = Math.sin(p) * 0.05 * move;
    this.body.scale.set(1, 1 + breathe * (pose === "sleep" ? 0.025 : 0.01), 1 + breathe * 0.015);

    this.lie = ease(this.lie, pose === "sleep" ? 1 : 0, Math.min(1, dt * 1.2));
    const lying = this.lie;
    const up = this.pitch / 1.2;
    this.front.forEach((l, i) => {
      const swing = Math.sin(p + (i ? Math.PI : 0)) * stride;
      // Reared up, the forepaws hang loose in front; sitting, they prop it up.
      const hang = -this.pitch + up * 0.5;
      l.rotation.z = ease(l.rotation.z, swing + hang + lying * 1.45, move > 0.3 ? 1 : k);
    });
    this.hind.forEach((l, i) => {
      const swing = Math.sin(p + (i ? 0 : Math.PI)) * stride;
      // Standing, sitting or rearing, the hind legs stay planted.
      const plant = -this.pitch + (pose === "sit" ? 1.25 : 0);
      l.rotation.z = ease(l.rotation.z, swing + plant + lying * 1.35, move > 0.3 ? 1 : k);
    });

    // The head: low and swinging as it walks, nose to the ground foraging,
    // raised to sniff the air when up on its hind legs, down on its paws asleep.
    const forage = pose === "forage" ? -0.75 + Math.sin(t * 1.3 + this.seed) * 0.12 : 0;
    const sniff = pose === "rear" || pose === "sit" ? Math.sin(t * 7) * 0.04 * Math.max(0, Math.sin(t * 0.9 + this.seed)) : 0;
    const headPitch = forage + sniff - this.pitch * (pose === "rear" ? 0.75 : 0.85) - 0.12 * move + (pose === "sleep" ? -0.35 : 0);
    this.head.rotation.z = ease(this.head.rotation.z, headPitch);
    const look = pose === "forage" ? Math.sin(t * 0.6 + this.seed) * 0.35 : pose === "sleep" ? 0.55 : Math.sin(t * 0.3 + this.seed) * 0.2 * (1 - move);
    this.head.rotation.y = ease(this.head.rotation.y, look + Math.sin(p) * 0.09 * move);
    this.head.position.y = ease(this.head.position.y, pose === "sleep" ? -0.02 : 0.12);
  }
}
