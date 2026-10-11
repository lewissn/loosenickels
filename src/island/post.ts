import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import type { Detail } from "./detail";
import type { Shared } from "./shared";

/* After the scene is drawn: bloom on whatever is brighter than white (the
   sun, glints on the water, fireflies), filmic tone mapping, and a gentle
   grade — a vignette, a little warmth in the lights and cool in the
   shadows, and a faint grain so gradients never band.

   Edges are smoothed by FXAA rather than multisampling. Measured on an M2
   at retina size, 4x MSAA on the half-float target more than doubled the
   frame time; FXAA costs about a millisecond. */

const Grade = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uNight: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uNight;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split tone: warm highlights, cool shadows; cooler still at night.
      c += mix(vec3(-0.012, -0.004, 0.02), vec3(0.025, 0.01, -0.02), smoothstep(0.15, 0.85, l)) * (1.0 - uNight * 0.5);
      // A soft S-curve for depth.
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
      // Vignette.
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * mix(0.55, 0.8, uNight);
      // Grain.
      c += (hash(vUv * 1000.0 + fract(uTime) * 61.0) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: Camera, detail: Detail, shared: Shared) {
  const size = renderer.getSize(new Vector2());
  const target = new WebGLRenderTarget(size.x * detail.pixelRatio, size.y * detail.pixelRatio, {
    type: HalfFloatType,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(detail.pixelRatio);
  composer.setSize(size.x, size.y);

  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.5, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new FXAAPass());
  const grade = new ShaderPass(Grade);
  composer.addPass(grade);

  return {
    /** Off renders the scene directly, for comparing while developing. */
    enabled: true,
    composer,
    bloom,
    render() {
      grade.uniforms.uTime.value = shared.uTime.value;
      grade.uniforms.uNight.value = shared.uNight.value;
      composer.render();
    },
    resize(w: number, h: number) { composer.setSize(w, h); },
    dispose() { composer.dispose(); },
  };
}
