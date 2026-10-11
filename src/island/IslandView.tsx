"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@/lib/brand";
import type { IslandOptions } from "./engine";
import s from "./island.module.css";

/* The page: the island filling the screen, and four quiet lines of text
   over it. The engine is loaded only once the page is in a browser. */

const HINT_FOR = 7000;

/** ?seed=42 grows a different island; ?t= and ?speed= move and hold the clock. */
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
  };
}

export function IslandView() {
  const stage = useRef<HTMLDivElement>(null);
  const [when, setWhen] = useState("");
  const [following, setFollowing] = useState(false);
  // Kept after letting go, so the caption fades out with its words intact.
  const [caption, setCaption] = useState("");
  const [hint, setHint] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const hideHint = () => setHint(false);
    const hintTimer = setTimeout(hideHint, HINT_FOR);

    import("./engine").then(({ startIsland, DEFAULT_OPTIONS }) => {
      if (cancelled || !stage.current) return;
      try {
        dispose = startIsland(stage.current, readOptions(DEFAULT_OPTIONS), {
          onWhen: setWhen,
          onFollow: (label) => {
            if (label) setCaption(`following ${label} · tap empty space to let go`);
            setFollowing(label !== null);
          },
          onInteract: hideHint,
        });
      } catch (error) {
        console.warn(error);
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(hintTimer);
      dispose?.();
    };
  }, []);

  return (
    <div className={s.island}>
      <div ref={stage} className={s.stage} />
      <div className={`${s.ui} ${s.when}`}>{when}</div>
      {failed ? (
        <div className={`${s.ui} ${s.hint}`}>This island needs WebGL, and this browser can’t provide it.</div>
      ) : (
        <div className={`${s.ui} ${s.hint} ${hint ? "" : s.gone}`}>drag to look around · tap an animal to follow it</div>
      )}
      <div className={`${s.ui} ${s.follow} ${following ? s.on : ""}`}>{caption}</div>
      <div className={`${s.ui} ${s.sig}`}>{brand.name}</div>
    </div>
  );
}
