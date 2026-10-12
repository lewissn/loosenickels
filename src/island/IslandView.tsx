"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@/lib/brand";
import type { IslandOptions } from "./engine";
import type { WalkState } from "./walk";
import s from "./island.module.css";

/* The page: the island filling the screen, and four quiet lines of text
   over it. The engine is loaded only once the page is in a browser. */

const HINT_FOR = 7000;

/**
 * ?seed=42 grows a different island; ?t= and ?speed= move and hold the
 * clock; ?weather=clear|rain|storm overrides the weather.
 */
function readOptions(defaults: IslandOptions): IslandOptions {
  const q = new URLSearchParams(location.search);
  const num = (key: string) => {
    const v = q.get(key);
    const n = v === null || v.trim() === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    seed: Math.trunc(num("seed") ?? 0) || defaults.seed,
    startDay: num("t") ?? defaults.startDay,
    speed: num("speed") ?? defaults.speed,
    weather: (["clear", "rain", "storm"] as const).find((w) => w === q.get("weather")),
  };
}

type Island = ReturnType<typeof import("./engine").startIsland>;
const IDLE_WALK: WalkState = { ready: false, active: false, who: "him", canSit: false, canKiss: false, sitting: false };

export function IslandView() {
  const stage = useRef<HTMLDivElement>(null);
  const island = useRef<Island | null>(null);
  const [when, setWhen] = useState("");
  const [following, setFollowing] = useState(false);
  // Kept after letting go, so the caption fades out with its words intact.
  const [caption, setCaption] = useState("");
  const [hint, setHint] = useState(true);
  const [failed, setFailed] = useState(false);
  const [walk, setWalk] = useState<WalkState>(IDLE_WALK);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hideHint = () => setHint(false);
    const hintTimer = setTimeout(hideHint, HINT_FOR);

    import("./engine").then(({ startIsland, DEFAULT_OPTIONS }) => {
      if (cancelled || !stage.current) return;
      setTouch(matchMedia("(pointer: coarse)").matches);
      try {
        island.current = startIsland(stage.current, readOptions(DEFAULT_OPTIONS), {
          onWhen: setWhen,
          onFollow: (label) => {
            if (label) setCaption(`following ${label} · tap empty space to let go`);
            setFollowing(label !== null);
          },
          onInteract: hideHint,
          onWalk: setWalk,
        });
      } catch (error) {
        console.warn(error);
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(hintTimer);
      island.current?.dispose();
      island.current = null;
    };
  }, []);

  // Following an animal or taking a walk means watching without touching,
  // and a phone takes that as being left alone and dims. Hold the screen on
  // for as long as either lasts (and only then, for the battery's sake).
  useWakeLock(following || walk.active);

  const startWalk = (as: "him" | "her") => { setHint(false); island.current?.walk.start(as); };
  const other = walk.who === "him" ? "her" : "him";
  const stopWalk = () => island.current?.walk.stop();

  return (
    <div className={s.island}>
      <div ref={stage} className={s.stage} />
      <div className={`${s.ui} ${s.when}`}>{when}</div>
      {failed ? (
        <div className={`${s.ui} ${s.hint}`}>This island needs WebGL, and this browser can’t provide it.</div>
      ) : (
        <div className={`${s.ui} ${s.hint} ${hint && !walk.active ? "" : s.gone}`}>drag to look around · tap an animal to follow it</div>
      )}
      <div className={`${s.ui} ${s.follow} ${following && !walk.active ? s.on : ""}`}>{caption}</div>
      <div className={`${s.ui} ${s.walkHint} ${walk.active ? s.on : ""}`}>
        {touch
          ? "thumb on the left to walk, further to run · drag to look · pinch to zoom"
          : "WASD or arrows to walk · shift to run · drag to look · scroll or I/O to zoom · Q to switch · K to kiss · esc to stop"}
      </div>
      <div className={s.actions}>
        {walk.active && walk.canKiss && (
          <button type="button" className={s.action} onClick={() => island.current?.walk.kiss()}>
            {touch ? `kiss ${other}` : `kiss ${other} (K)`}
          </button>
        )}
        {walk.active && walk.canSit && (
          <button type="button" className={s.action} onClick={() => island.current?.walk.sit()}>
            {touch ? "sit on the bench" : "sit on the bench (E)"}
          </button>
        )}
        {walk.ready && walk.active && (
          <button type="button" className={s.action} onClick={() => startWalk(other)}>
            {touch ? `switch to ${other}` : `switch to ${other} (Q)`}
          </button>
        )}
        {walk.ready && walk.active && (
          <button type="button" className={s.action} onClick={stopWalk}>stop walking</button>
        )}
        {walk.ready && !walk.active && (
          <>
            <button type="button" className={s.action} onClick={() => startWalk("her")}>walk as her</button>
            <button type="button" className={s.action} onClick={() => startWalk("him")}>walk as him</button>
          </>
        )}
      </div>
      {walk.active && touch && <Thumbstick onMove={(x, y) => island.current?.walk.stick(x, y)} />}
      <div className={`${s.ui} ${s.sig}`}>{brand.name}</div>
    </div>
  );
}

/** Keeps the screen from dimming while `wanted`, where the browser allows it. */
function useWakeLock(wanted: boolean) {
  useEffect(() => {
    if (!wanted || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null, done = false;
    const take = () => {
      if (done || document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then((l) => {
        if (done) l.release();
        else lock = l;
      }).catch(() => { /* refused (low battery, say): nothing to be done */ });
    };
    // The browser drops the lock whenever the page is hidden; take it back.
    const onVisible = () => { if (document.visibilityState === "visible") take(); };
    take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [wanted]);
}

/** A thumbstick that appears wherever the left thumb lands. */
function Thumbstick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const zone = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 56;
  const move = useRef(onMove);
  useEffect(() => { move.current = onMove; }, [onMove]);

  // Listened for on the stick itself, natively, and stopped there. React
  // listens at the document — the same place the camera does once a finger
  // is on it — so stopping the thumb's touches in a React handler would be
  // too late: the camera would still read the thumb as a second drag.
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    let origin: { x: number; y: number } | null = null, id = -1;
    const at = (e: PointerEvent) => {
      if (!origin) return;
      let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      setKnob({ x: dx, y: dy });
      move.current(dx / R, -dy / R);
    };
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      if (origin) return; // one thumb at a time
      try { el.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
      origin = { x: e.clientX, y: e.clientY };
      id = e.pointerId;
      setBase(origin);
      at(e);
    };
    const moved = (e: PointerEvent) => { e.stopPropagation(); if (e.pointerId === id) at(e); };
    const up = (e: PointerEvent) => {
      e.stopPropagation();
      if (e.pointerId !== id) return;
      origin = null;
      id = -1;
      setBase(null);
      setKnob({ x: 0, y: 0 });
      move.current(0, 0);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", moved);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", moved);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div ref={zone} className={s.stickZone}>
      {base && (
        <div className={s.stickBase} style={{ left: base.x - R, top: base.y - R, width: R * 2, height: R * 2 }}>
          <div className={s.stickKnob} style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      )}
    </div>
  );
}
