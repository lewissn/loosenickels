import { Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Creature } from "./creatures";
import type { Detail } from "./detail";
import type { World } from "./world";

/* The camera: orbit and zoom (never pan, never below the horizon or into
   the ground), a slow turn when nobody is touching it, and following.

   Tapping an animal glides the camera in after it; tapping empty space
   lets it go and the camera drifts back to the island. */

const IDLE_BEFORE_TURNING = 8000;
const HOME = new Vector3(0, 6, 0);

export interface ViewerEvents {
  /** The first touch of the controls, for dismissing the hint. */
  onInteract(): void;
  onFollow(creature: Creature | null): void;
}

export function createViewer(canvas: HTMLCanvasElement, detail: Detail, hitboxes: Mesh[], events: ViewerEvents) {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const camera = new PerspectiveCamera(45, aspect, 0.5, 1500);
  const startDist = aspect < 0.8 ? 270 : 180;
  camera.position.copy(new Vector3(1, 0.62, 1).normalize().multiplyScalar(startDist));

  const turnSpeed = detail.reducedMotion ? 0.12 : 0.35;
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 360;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.autoRotate = true;
  controls.autoRotateSpeed = turnSpeed;

  let follow: Creature | null = null;
  let lastInteract = performance.now();
  let downAt: { x: number; y: number; t: number } | null = null;

  const onStart = () => {
    lastInteract = performance.now();
    controls.autoRotate = false;
    events.onInteract();
  };
  controls.addEventListener("start", onStart);

  const raycaster = new Raycaster(), ndc = new Vector2();
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8 || performance.now() - downAt.t > 400) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitboxes, false)[0];
    if (hit) {
      follow = hit.object.userData.creature as Creature;
      events.onFollow(follow);
    } else if (follow) {
      follow = null;
      events.onFollow(null);
    }
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);

  const delta = new Vector3();
  const glide = detail.reducedMotion ? 0.5 : 1;

  function update(dt: number, world: World) {
    if (follow) {
      const p = follow.focus();
      delta.copy(p).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 4 * glide));
      controls.target.add(delta);
      camera.position.add(delta);
      const want = follow.kind === "rabbit" || follow.kind === "fox" ? 14 : follow.kind === "person" ? 12 : 20, d = camera.position.distanceTo(controls.target);
      if (d > want + 0.5) camera.position.lerp(controls.target, ((d - want) / d) * (1 - Math.exp(-dt * 1.5 * glide)));
    } else {
      delta.copy(HOME).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 0.8));
      controls.target.add(delta);
      if (performance.now() - lastInteract > IDLE_BEFORE_TURNING) controls.autoRotate = true;
    }
    controls.update(dt);
    const ground = Math.max(world.height(camera.position.x, camera.position.z), 0.5) + 2.5;
    if (camera.position.y < ground) camera.position.y = ground;
  }

  function resize(width: number, height: number) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    controls.removeEventListener("start", onStart);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    controls.dispose();
  }

  return { camera, controls, update, resize, dispose };
}
