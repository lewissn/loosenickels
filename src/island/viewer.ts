import { Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Creature } from "./creatures";
import type { Detail } from "./detail";
import type { World } from "./world";

/* The camera: orbit and zoom (never pan, never below the horizon or into
   the ground), a slow turn when nobody is touching it, and following.

   Tapping an animal glides the camera in after it; tapping empty space
   lets it go and the camera drifts back to the island.

   When you take a walk as the man from the cottage, the camera rides with
   him instead: close behind, still yours to drag around, swinging back in
   behind him when he walks and you've let go. */

const IDLE_BEFORE_TURNING = 8000;
const HOME = new Vector3(0, 6, 0);
const UP = new Vector3(0, 1, 0);
/** How far behind him the camera rides, by default; and as far in and out as it goes. */
const RIDE_DISTANCE = 9.5, RIDE_NEAREST = 0.35, RIDE_FURTHEST = 32;
/** Closer than this, it's first person. */
const FIRST_PERSON = 1.1;

/** Someone the camera rides with, for walking. */
export interface Rider {
  focus(): Vector3;
  heading(): number;
  moving(): boolean;
  /** Whether a point is inside something the camera shouldn't enter. */
  solid(x: number, y: number, z: number): boolean;
  /** Zoomed right in, the camera is behind his eyes: hide him. */
  show(visible: boolean): void;
}

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
  let rider: Rider | null = null;
  let dragging = false, lastDrag = 0;
  // The distance you've chosen to ride at, and whether the camera has been
  // pulled in closer than that to keep the house out of the way.
  let preferred = RIDE_DISTANCE, pulled = false, firstPerson = false;
  let lastInteract = performance.now();
  let downAt: { x: number; y: number; t: number } | null = null;

  const onStart = () => {
    lastInteract = performance.now();
    controls.autoRotate = false;
    dragging = true;
    events.onInteract();
  };
  const onEnd = () => { dragging = false; lastDrag = performance.now(); };
  controls.addEventListener("start", onStart);
  controls.addEventListener("end", onEnd);

  const raycaster = new Raycaster(), ndc = new Vector2();
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e: PointerEvent) => {
    if (rider) return;
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

  /** Rides with someone (for walking), or stops riding when given null. */
  function ride(next: Rider | null) {
    rider = next;
    if (follow) { follow = null; events.onFollow(null); }
    if (rider) {
      controls.autoRotate = false;
      controls.minDistance = RIDE_NEAREST;
      controls.maxDistance = RIDE_FURTHEST;
      controls.maxPolarAngle = Math.PI * 0.49;
      preferred = RIDE_DISTANCE;
      pulled = false;
      firstPerson = false;
      // Start behind and above him, or at the first angle round him with a
      // clear view (in front, looking back, if the house is behind him).
      const p = rider.focus(), h = rider.heading();
      controls.target.copy(p);
      for (let i = 0; i <= 8; i++) {
        const a = h + Math.PI + Math.ceil(i / 2) * (Math.PI / 4) * (i % 2 ? 1 : -1);
        offset.set(Math.cos(a) * RIDE_DISTANCE, 3.2, -Math.sin(a) * RIDE_DISTANCE);
        if (clearView(p, offset)) break;
      }
      camera.position.copy(p).add(offset);
    } else {
      controls.minDistance = 6;
      controls.maxDistance = 360;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI * 0.47;
      lastInteract = performance.now();
    }
  }

  const offset = new Vector3(), probe = new Vector3();

  /** Whether the camera at target + o would see the target with nothing in between. */
  function clearView(target: Vector3, o: Vector3) {
    if (!rider) return true;
    for (let f = 0.2; f <= 1.0001; f += 0.1) {
      probe.copy(target).addScaledVector(o, f);
      if (rider.solid(probe.x, probe.y, probe.z)) return false;
    }
    return true;
  }

  function update(dt: number, world: World) {
    if (rider) {
      const p = rider.focus();
      delta.copy(p).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 10));
      controls.target.add(delta);
      camera.position.add(delta);
      // Swing round behind him as he walks, once you've let go of the view.
      if (rider.moving() && !dragging && performance.now() - lastDrag > 1200) {
        offset.copy(camera.position).sub(controls.target);
        const h = rider.heading();
        const now = Math.atan2(offset.x, offset.z), behind = Math.atan2(-Math.cos(h), Math.sin(h));
        let turn = (behind - now) % (Math.PI * 2);
        if (turn > Math.PI) turn -= Math.PI * 2;
        if (turn < -Math.PI) turn += Math.PI * 2;
        offset.applyAxisAngle(UP, turn * Math.min(1, dt * 1.6 * glide));
        // Only swing where the view stays clear.
        if (clearView(controls.target, offset)) camera.position.copy(controls.target).add(offset);
      }
      controls.update(dt);
      // If something's between him and the camera, come in closer than it.
      offset.copy(camera.position).sub(controls.target);
      const len = offset.length();
      if (!Number.isFinite(len)) {
        // Never let the camera go missing: put it back behind him.
        const h = rider.heading();
        camera.position.set(controls.target.x - Math.cos(h) * RIDE_DISTANCE, controls.target.y + 3.2, controls.target.z + Math.sin(h) * RIDE_DISTANCE);
        return;
      }
      // Whatever distance you zoom to is the one to keep, unless the camera
      // is only this close because something got in the way.
      if (!pulled) preferred = Math.min(RIDE_FURTHEST, Math.max(RIDE_NEAREST, len));
      let clear = true;
      for (let f = 0.15; f <= 1; f += 0.05) {
        const x = controls.target.x + offset.x * f, y = controls.target.y + offset.y * f, z = controls.target.z + offset.z * f;
        if (rider.solid(x, y, z)) {
          camera.position.copy(controls.target).addScaledVector(offset, Math.max(RIDE_NEAREST / len, f - 0.1));
          clear = false;
          pulled = true;
          break;
        }
      }
      // Still inside something (he's at the door with the house behind him,
      // say)? Swing round him to the nearest clear side instead.
      if (rider.solid(camera.position.x, camera.position.y, camera.position.z)) {
        offset.copy(camera.position).sub(controls.target).setLength(RIDE_DISTANCE);
        for (let i = 1; i <= 18; i++) {
          const a = Math.ceil(i / 2) * (Math.PI / 9) * (i % 2 ? 1 : -1);
          const o = offset.clone().applyAxisAngle(UP, a);
          if (!rider.solid(controls.target.x + o.x, controls.target.y + o.y, controls.target.z + o.z)) {
            camera.position.copy(controls.target).add(o);
            break;
          }
        }
        clear = false;
      }
      // Once the way is clear again, drift back out to your distance.
      if (clear && pulled) {
        const now = camera.position.distanceTo(controls.target);
        if (now >= preferred - 0.05) pulled = false;
        else camera.position.copy(controls.target).addScaledVector(offset, (now + (preferred - now) * Math.min(1, dt * 1.5)) / len);
      }
      // Right in close, see through his eyes.
      const fp = camera.position.distanceTo(controls.target) < FIRST_PERSON;
      if (fp !== firstPerson) { firstPerson = fp; rider.show(!fp); }
      const ground = Math.max(world.height(camera.position.x, camera.position.z), 0) + (firstPerson ? 0.2 : 1.2);
      if (camera.position.y < ground) camera.position.y = ground;
      // A last guard: however it happened, a camera that has flown off (or
      // lost its position) goes back behind him at your distance.
      const now = camera.position.distanceTo(controls.target);
      if (!Number.isFinite(now) || now > RIDE_FURTHEST * 1.5) {
        const h = rider.heading();
        camera.position.set(controls.target.x - Math.cos(h) * preferred, controls.target.y + preferred * 0.33, controls.target.z + Math.sin(h) * preferred);
        pulled = false;
      }
      return;
    }
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
    controls.removeEventListener("end", onEnd);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    controls.dispose();
  }

  /** Zooms the riding camera in (f < 1) or out (f > 1). */
  function zoom(f: number) {
    if (!rider) return;
    offset.copy(camera.position).sub(controls.target);
    const len = Math.min(RIDE_FURTHEST, Math.max(RIDE_NEAREST, offset.length() * f));
    camera.position.copy(controls.target).add(offset.setLength(len));
    preferred = len;
    pulled = false;
  }

  return { camera, controls, update, resize, dispose, ride, zoom };
}
