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
const IDLE_WALK: WalkState = { ready: false, active: false, canSit: false, sitting: false };

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

  const startWalk = () => { setHint(false); island.current?.walk.start(); };
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
          ? "thumb on the left to walk, further to run · drag to look"
          : "WASD or arrows to walk · shift to run · drag to look · esc to stop"}
      </div>
      <div className={s.actions}>
        {walk.active && walk.canSit && (
          <button type="button" className={s.action} onClick={() => island.current?.walk.sit()}>
            {touch ? "sit on the bench" : "sit on the bench (E)"}
          </button>
        )}
        {walk.ready && (
          <button type="button" className={s.action} onClick={walk.active ? stopWalk : startWalk}>
            {walk.active ? "stop walking" : "take a walk"}
          </button>
        )}
      </div>
      {walk.active && touch && <Thumbstick onMove={(x, y) => island.current?.walk.stick(x, y)} />}
      <div className={`${s.ui} ${s.sig}`}>{brand.name}</div>
    </div>
  );
}

/** A thumbstick that appears wherever the left thumb lands. */
function Thumbstick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 56;

  const move = (e: React.PointerEvent) => {
    const from = origin.current;
    if (!from) return;
    let dx = e.clientX - from.x, dy = e.clientY - from.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    setKnob({ x: dx, y: dy });
    onMove(dx / R, -dy / R);
  };
  const end = () => { origin.current = null; setBase(null); setKnob({ x: 0, y: 0 }); onMove(0, 0); };

  return (
    <div
      className={s.stickZone}
      onPointerDown={(e) => {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
        origin.current = { x: e.clientX, y: e.clientY };
        setBase(origin.current);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {base && (
        <div className={s.stickBase} style={{ left: base.x - R, top: base.y - R, width: R * 2, height: R * 2 }}>
          <div className={s.stickKnob} style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      )}
    </div>
  );
}
