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
  // Riding: the distance you've chosen (by zooming), the distance the camera
  // is actually at (closer when something's in the way), and the distance
  // it was set to last frame (so a change means you zoomed).
  let preferred = RIDE_DISTANCE, current = RIDE_DISTANCE, lastSet = RIDE_DISTANCE, firstPerson = false;
  const dir = new Vector3(), offset = new Vector3(), probe = new Vector3();
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

  /**
   * Rides with someone (for walking), or stops riding when given null. With
   * `glide`, keeps the current view and glides across to them (switching
   * from one walker to the other).
   */
  function ride(next: Rider | null, glide = false) {
    if (glide && rider && next) {
      rider = next;
      firstPerson = false; // re-checked next frame, for whoever's now ridden
      return;
    }
    rider = next;
    if (follow) { follow = null; events.onFollow(null); }
    if (rider) {
      controls.autoRotate = false;
      controls.minDistance = RIDE_NEAREST;
      controls.maxDistance = RIDE_FURTHEST;
      controls.maxPolarAngle = Math.PI * 0.49;
      preferred = current = lastSet = RIDE_DISTANCE;
      firstPerson = false;
      // Start behind and a little above them — or, if that's inside the
      // house (stepping out of the door), at the first clear angle round
      // them, which may be in front, looking back.
      const p = rider.focus(), h = rider.heading();
      controls.target.copy(p);
      for (let i = 0; i <= 8; i++) {
        const a = Math.ceil(i / 2) * (Math.PI / 4) * (i % 2 ? 1 : -1);
        dir.set(-Math.cos(h), 0, Math.sin(h)).applyAxisAngle(UP, a).setY(0.34).normalize();
        let clear = true;
        for (let d = 1; d <= RIDE_DISTANCE && clear; d += 0.5) {
          probe.copy(p).addScaledVector(dir, d);
          if (rider.solid(probe.x, probe.y, probe.z)) clear = false;
        }
        if (clear) break;
      }
      camera.position.copy(p).addScaledVector(dir, RIDE_DISTANCE);
    } else {
      controls.minDistance = 6;
      controls.maxDistance = 360;
      controls.maxPolarAngle = Math.PI * 0.47;
      lastInteract = performance.now();
    }
  }

  function update(dt: number, world: World) {
    if (rider) {
      // Worked out afresh each frame from a direction and a distance, so
      // nothing builds up from one frame to the next and it can't fly off.
      const p = rider.focus();
      delta.copy(p).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 6));
      controls.target.add(delta);
      camera.position.add(delta);
      controls.update(dt); // your dragging and zooming, with their easing

      offset.copy(camera.position).sub(controls.target);
      const measured = offset.length();
      if (!Number.isFinite(measured) || measured < 1e-4) {
        const h = rider.heading();
        dir.set(-Math.cos(h), 0.34, Math.sin(h)).normalize();
      } else {
        dir.copy(offset).divideScalar(measured);
        // A distance other than the one we set means you zoomed.
        if (Math.abs(measured - lastSet) > 0.01) preferred = Math.min(RIDE_FURTHEST, Math.max(RIDE_NEAREST, preferred * (measured / lastSet)));
      }

      // Swing round behind them as they walk, once you've let go of the view.
      if (rider.moving() && !dragging && performance.now() - lastDrag > 1200) {
        const h = rider.heading();
        const now = Math.atan2(dir.x, dir.z), behind = Math.atan2(-Math.cos(h), Math.sin(h));
        let turn = (behind - now) % (Math.PI * 2);
        if (turn > Math.PI) turn -= Math.PI * 2;
        if (turn < -Math.PI) turn += Math.PI * 2;
        dir.applyAxisAngle(UP, turn * Math.min(1, dt * 1.6 * glide));
      }

      // As far out as you've chosen, unless something's in the way: then
      // just in front of it. In at once; back out gently.
      let want = preferred;
      for (let d = RIDE_NEAREST; d <= preferred; d += 0.25) {
        probe.copy(controls.target).addScaledVector(dir, d);
        if (rider.solid(probe.x, probe.y, probe.z)) { want = Math.max(RIDE_NEAREST, d - 0.3); break; }
      }
      current = want < current ? want : current + (want - current) * Math.min(1, dt * 2);
      camera.position.copy(controls.target).addScaledVector(dir, current);

      const ground = Math.max(world.height(camera.position.x, camera.position.z), 0) + (current < FIRST_PERSON ? 0.2 : 1.2);
      if (camera.position.y < ground) camera.position.y = ground;
      lastSet = camera.position.distanceTo(controls.target);

      // Right in close, see through their eyes.
      const fp = lastSet < FIRST_PERSON;
      if (fp !== firstPerson) { firstPerson = fp; rider.show(!fp); }
      return;
    }
    if (follow) {
      const p = follow.focus();
      delta.copy(p).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 4 * glide));
      controls.target.add(delta);
      camera.position.add(delta);
      const want = follow.kind === "rabbit" || follow.kind === "fox" ? 14 : follow.kind === "person" || follow.kind === "dog" ? 12 : 20, d = camera.position.distanceTo(controls.target);
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
    if (rider) preferred = Math.min(RIDE_FURTHEST, Math.max(RIDE_NEAREST, preferred * f));
  }

  return { camera, controls, update, resize, dispose, ride, zoom };
}
