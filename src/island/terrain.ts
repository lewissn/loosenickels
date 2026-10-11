import { Color, DataTexture, LinearFilter, Mesh, MeshStandardMaterial, PlaneGeometry, RedFormat, UnsignedByteType } from "three";
import { NOISE_GLSL, type Shared } from "./shared";
import type { Detail } from "./detail";
import type { World } from "./world";

/* The ground: a smooth mesh coloured per pixel.

   Sand, grass, rock and snow are decided in the shader from height, slope
   and a few octaves of noise, so their edges wander naturally and the
   season's colours change without touching the geometry. */

export const SNOW = new Color(0xf2f5f8);

/** The span of the terrain and its height map, in world units. */
export const TERRAIN_SIZE = 260;
/** Heights the water's height map can tell apart: the shallows that matter. */
export const DEPTH_RANGE: [number, number] = [-8, 4];
/** The whole island's heights, for the mist to find the hollows. */
export const GROUND_RANGE: [number, number] = [-8, 40];

const COLOURS = {
  uSeabed: new Color(0x4f8478), uWetSand: new Color(0xa89466), uSand: new Color(0xe3cf9a),
  uRock: new Color(0x8d877e), uRockDark: new Color(0x5f5a54), uSnowCol: SNOW,
};

export function createTerrain(world: World, detail: Detail, shared: Shared) {
  const seg = detail.terrainSegments;
  const geo = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, world.height(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const material = new MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uGrass: shared.uGrass, uMeadow: shared.uMeadow, uSnowLine: shared.uSnowLine, uWet: shared.uWet,
      ...Object.fromEntries(Object.entries(COLOURS).map(([k, v]) => [k, { value: v }])),
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;")
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;
        uniform vec3 uGrass, uMeadow, uSeabed, uWetSand, uSand, uRock, uRockDark, uSnowCol;
        uniform float uSnowLine, uWet;
        float wetness;
        ${NOISE_GLSL}`)
      .replace("#include <color_fragment>", /* glsl */ `
        float h = vWPos.y;
        float ny = normalize(vWNormal).y;
        vec2 p = vWPos.xz;
        float n1 = fbm2(p * 0.12);
        float n2 = vnoise(p * 1.9);
        float n3 = fbm2(p * 0.035 + 40.0);

        vec3 grass = mix(uGrass, uMeadow, smoothstep(0.3, 0.72, n1));
        grass *= 0.84 + n2 * 0.22;
        grass = mix(grass, grass * vec3(1.12, 1.02, 0.72), smoothstep(0.55, 0.8, n3) * 0.6);
        vec3 sand = uSand * (0.92 + n2 * 0.12);
        vec3 rock = mix(uRock, uRockDark, smoothstep(0.3, 0.7, n1)) * (0.82 + n2 * 0.3);

        vec3 col = mix(sand, grass, smoothstep(0.8, 2.0, h + (n1 - 0.5) * 0.9));
        vec3 under = mix(uSeabed, uWetSand, smoothstep(-6.0, -0.8, h));
        col = mix(under, col, smoothstep(-0.5, 0.75, h));
        float steep = 1.0 - smoothstep(0.66, 0.84, ny + (n1 - 0.5) * 0.14);
        float high = smoothstep(26.0, 33.0, h + n1 * 5.0);
        col = mix(col, rock, max(steep, high) * smoothstep(0.4, 1.4, h));

        float sl = uSnowLine + (n1 - 0.5) * 8.0;
        col = mix(col, uSnowCol * (0.95 + n2 * 0.05), smoothstep(sl, sl + 2.5, h) * smoothstep(0.45, 0.72, ny));
        // Rain darkens the ground and gives it a sheen; snow stays dry-looking.
        float snowy = smoothstep(sl, sl + 2.5, h);
        wetness = uWet * (1.0 - snowy) * smoothstep(-0.5, 1.0, h);
        diffuseColor.rgb = col * (1.0 - wetness * 0.3);
      `)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, wetness);");
  };

  const mesh = new Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  return { mesh, heightMap: bakeHeightMap(world, DEPTH_RANGE), groundMap: bakeHeightMap(world, GROUND_RANGE) };
}

/** Terrain height over [lo, hi] as a texture spanning the terrain. */
function bakeHeightMap(world: World, [lo, hi]: [number, number]) {
  const n = 256, data = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * TERRAIN_SIZE, z = (j / (n - 1) - 0.5) * TERRAIN_SIZE;
      const h = Math.min(hi, Math.max(lo, world.height(x, z)));
      data[j * n + i] = Math.round(((h - lo) / (hi - lo)) * 255);
    }
  }
  const tex = new DataTexture(data, n, n, RedFormat, UnsignedByteType);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
