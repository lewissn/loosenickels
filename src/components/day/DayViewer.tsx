"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bestRendition, type ResolvedDay } from "@/lib/archive/schema";
import { clockTime, full, relativeDay, stamp, today, yearOf } from "@/lib/util/calendar";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import styles from "./DayViewer.module.css";

/* =========================================================================
   The daily viewer

   The viewport is a stage. Nothing stacks and nothing scrolls: the wheel,
   the arrow keys and a vertical drag move through days.

   Direction, stated once:

       down / right  ->  backward in time, into the archive
       up   / left   ->  forward in time, toward today

   ---- How the motion works ------------------------------------------------

   Position is a single float held in a ref. Day 0 is the most recent; 2.4
   means "between the third and fourth day, nearer the fourth". Everything
   visible is a function of it.

   Nothing about that float lives in React state, and that is the whole
   point. A trackpad emits wheel events at 120Hz; putting the gesture in
   state re-renders the tree on every one of them, and no amount of easing
   makes a component that re-renders 120 times a second feel smooth. React
   is told only when the *displayed day* changes, which happens once per day
   crossed rather than once per event.

   A single requestAnimationFrame loop owns the frame: it integrates
   inertia, springs toward the nearest day once input stops, and writes
   transforms straight onto the elements. There are no CSS transitions on
   anything the gesture drives — a transition is a fixed-duration ease
   fighting the hand, which is exactly what made the first version feel
   laggy rather than connected.
   ========================================================================= */

interface Props {
  /** Newest first. The order the archive hands them over in. */
  days: ResolvedDay[];
  /** The owner's zone, for deciding what "today" means. */
  timeZone: string;
  /** Present only when the viewer owns the archive. */
  status?: { todayRecorded: boolean };
}

/* ---- Feel ---------------------------------------------------------------
   These five numbers are the entire character of the interaction, so they
   are named and gathered rather than buried in the loop. */

/** Wheel pixels that amount to one whole day. */
const PIXELS_PER_DAY = 420;
/** How much of the current velocity is carried into where it lands. */
const PROJECTION = 0.12;
/** Spring stiffness toward the resting day. */
const STIFFNESS = 0.12;
/** Velocity retained per frame. Below 1, so motion always dies out. */
const DAMPING = 0.82;
/** Days per frame above which the interface stops pretending to be cinema. */
const SCRUB_SPEED = 0.055;

/** Days either side of the resting one that are kept mounted and decoded. */
const WINDOW = 2;

export function DayViewer({ days, timeZone, status }: Props) {
  /* The day whose writing is on screen. React state, and the only thing
     here that causes a render — once per day crossed. */
  const [display, setDisplay] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  /* Two states, because looking at a photograph and reading a day are two
     different activities and one layout cannot serve both.

     Composed is the reading state: the picture is large but the writing has
     real room. Immersive is the looking state: the photograph takes the
     screen and everything else withdraws. Trying to do both at once is what
     makes a photograph look like it is sitting in a container. */
  const [immersive, setImmersive] = useState(false);

  const reduced = useReducedMotion();

  const stage = useRef<HTMLDivElement>(null);
  const type = useRef<HTMLDivElement>(null);
  const slides = useRef(new Map<string, HTMLElement>());

  /* The motion state. Refs, not state: written every frame, never rendered. */
  const startRef = useRef<() => void>(() => {});
  const immersiveRef = useRef(false);
  immersiveRef.current = immersive;
  const pos = useRef(0);
  const velocity = useRef(0);
  const target = useRef<number | null>(null);
  const lastInput = useRef(0);
  const running = useRef(false);

  const count = days.length;

  /* The mounted window. Recomputed on render, and read by the frame loop
     through a ref so the loop never closes over a stale array. */
  const visible = useMemo(() => {
    const from = Math.max(0, display - WINDOW);
    const to = Math.min(count - 1, display + WINDOW);
    const out: Array<{ day: ResolvedDay; index: number }> = [];
    for (let i = from; i <= to; i++) {
      const day = days[i];
      if (day) out.push({ day, index: i });
    }
    return out;
  }, [days, display, count]);

  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  /* ---- The frame -------------------------------------------------------
     One loop, started on input and stopped when everything has settled, so
     an idle archive costs nothing. */
  useEffect(() => {
    if (reduced) return;

    let raf = 0;
    let previous = performance.now();

    function paint() {
      const p = pos.current;

      for (const { day, index } of visibleRef.current) {
        const el = slides.current.get(day.date);
        if (!el) continue;

        /* Offset from the front of the stack. Negative is a day already
           passed; positive is one still behind. */
        const d = index - p;

        /* The current photograph recedes and the next advances from behind.
           A day already passed comes forward and out, rather than sliding
           aside, so the movement reads as depth rather than as a carousel. */
        const at = place(d);
        el.style.transform = at.transform;
        el.style.opacity = String(at.opacity);
        el.style.zIndex = String(at.zIndex);
        /* Anything fully transparent stops taking hit tests and stops being
           handed to the compositor as a live layer. */
        el.style.visibility = at.hidden ? "hidden" : "visible";
      }

      /* The writing belongs to one day, so rather than crossfading two sets
         of text it simply withdraws between days and returns once settled.
         Text dissolving into other text is the cheapest-looking transition
         there is. */
      if (type.current) {
        const frac = Math.abs(p - Math.round(p));
        /* Written here rather than in CSS because this property is set every
           frame; a stylesheet rule would simply be overwritten. */
        const withdrawn = immersiveRef.current ? 0 : Math.max(0, 1 - frac * 2.4);
        type.current.style.opacity = String(withdrawn);
        type.current.style.transform = `translate3d(0, ${(p - Math.round(p)) * -1.6}vh, 0)`;
      }
    }

    function tick(now: number) {
      /* Normalised against 60fps so the feel is identical on a 120Hz
         display, where otherwise every spring would resolve twice as fast. */
      const dt = Math.min(3, (now - previous) / 16.667);
      previous = now;

      const idle = now - lastInput.current > 90;

      if (idle && target.current === null) {
        /* Input has stopped. Choose where this gesture was always going to
           land — carrying a little of its velocity, so a firm flick travels
           further than a nudge — and settle there. */
        const projected = pos.current + velocity.current * PROJECTION * 60;
        target.current = clamp(Math.round(projected), 0, count - 1);
      }

      if (target.current !== null) {
        const distance = target.current - pos.current;
        velocity.current += distance * STIFFNESS * dt;
        velocity.current *= Math.pow(DAMPING, dt);
        pos.current += velocity.current * dt;

        if (Math.abs(distance) < 0.001 && Math.abs(velocity.current) < 0.001) {
          pos.current = target.current;
          velocity.current = 0;
          running.current = false;
        }
      } else {
        velocity.current *= Math.pow(DAMPING, dt);
      }

      pos.current = clamp(pos.current, 0, count - 1);

      const rounded = clamp(Math.round(pos.current), 0, count - 1);
      setDisplay((current) => (current === rounded ? current : rounded));

      const fast = Math.abs(velocity.current) > SCRUB_SPEED;
      setScrubbing((current) => (current === fast ? current : fast));

      paint();

      raf = running.current ? requestAnimationFrame(tick) : 0;
    }

    function start() {
      if (raf) return;
      previous = performance.now();
      running.current = true;
      raf = requestAnimationFrame(tick);
    }

    startRef.current = start;
    paint();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      running.current = false;
    };
  }, [reduced, count]);

  /** Move the position directly, as a gesture does. */
  function drive(deltaDays: number) {
    pos.current = clamp(pos.current + deltaDays, -0.35, count - 1 + 0.35);
    velocity.current = deltaDays;
    target.current = null;
    lastInput.current = performance.now();
    running.current = true;
    startRef.current();
  }

  /** Aim at a specific day, as a key press does. */
  function aim(index: number) {
    target.current = clamp(index, 0, count - 1);
    lastInput.current = 0;
    running.current = true;
    startRef.current();
  }

  /* ---- Wheel ----------------------------------------------------------- */
  useEffect(() => {
    const el = stage.current;
    if (!el || reduced) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();

      /* deltaY is not always pixels. A trackpad reports pixels, but a great
         many mice report *lines* (deltaMode 1) and a few report pages, and a
         line is roughly sixteen pixels. Reading deltaY raw means a mouse
         wheel moves the archive by three units where a trackpad moves it by
         fifty — the interaction would feel completely different depending on
         what someone happened to be holding. */
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;

      /* Horizontal intent counts too. A two-finger sideways swipe on a
         trackpad is the same gesture as a vertical one on a device where the
         horizontal axis is the easier movement. */
      const dominant = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

      drive((dominant * scale) / PIXELS_PER_DAY);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  /* ---- Keyboard -------------------------------------------------------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const at = Math.round(pos.current);
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          if (reduced) jump(at + 1);
          else aim(at + 1);
          break;
        case "ArrowUp":
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          if (reduced) jump(at - 1);
          else aim(at - 1);
          break;
        case "Escape":
          if (immersive) {
            e.preventDefault();
            setImmersive(false);
          }
          break;
        case "Home":
          e.preventDefault();
          if (reduced) jump(0);
          else aim(0);
          break;
        case "End":
          e.preventDefault();
          if (reduced) jump(count - 1);
          else aim(count - 1);
          break;
      }
    }

    /** Reduced motion does not mean no navigation — it means no travel. */
    function jump(index: number) {
      const next = clamp(index, 0, count - 1);
      pos.current = next;
      setDisplay(next);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---- Touch -----------------------------------------------------------
     One deliberate drag, tracking the finger the whole way. No momentum
     flinging past several days: this is memory, not a feed. */
  useEffect(() => {
    const el = stage.current;
    if (!el || reduced) return;

    let last = 0;
    let active = false;

    function onStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      last = touch.clientY;
      active = true;
      target.current = null;
      lastInput.current = performance.now();
    }
    function onMove(e: TouchEvent) {
      const touch = e.touches[0];
      if (!active || !touch) return;
      const moved = last - touch.clientY;
      last = touch.clientY;
      drive(moved / (window.innerHeight * 0.42));
    }
    function onEnd() {
      active = false;
      lastInput.current = 0;
      startRef.current();
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  });

  /* Decode the neighbours ahead of the gesture that will reveal them. */
  useEffect(() => {
    for (const { day } of visible) {
      const src = bestRendition(day.photo);
      if (!src) continue;
      const img = new Image();
      img.src = src;
    }
  }, [visible]);

  useEffect(() => {
    const root = document.documentElement;
    if (immersive) root.setAttribute("data-immersive", "");
    else root.removeAttribute("data-immersive");
    return () => root.removeAttribute("data-immersive");
  }, [immersive]);

  /* The environment is published to the document, not kept on the stage.

     Chrome — the menu, the record control — lives outside this component, so
     scoping the palette to the stage left those controls resolving the light
     palette while sitting on a surface the photograph had just turned dark.
     They were dark ink on a dark ground with a pale halo behind them. The
     room has one light level and everything standing in it shares it. */
  useEffect(() => {
    const root = document.documentElement;
    const dark = (days[display]?.photo.lightness ?? 0.5) < 0.4;
    if (dark) root.setAttribute("data-env", "dark");
    else root.removeAttribute("data-env");
    return () => root.removeAttribute("data-env");
  }, [days, display]);

  const now = useMemo(() => today(timeZone), [timeZone]);
  const day = days[display];

  if (!day) {
    return (
      <div className={styles.stage}>
        <p className={styles.empty}>Nothing has been recorded yet.</p>
      </div>
    );
  }

  /* The photograph decides how light the room is. Below this the ground goes
     dark enough that dark ink would fail against it, so the whole subtree
     takes the night palette — which is also simply the right way to hang a
     dark photograph. */
  const envDark = (day.photo.lightness ?? 0.5) < 0.4;
  const relative = relativeDay(day.date, now);
  const captureZone = day.captureTimeZone ?? timeZone;

  return (
    <div
      ref={stage}
      className={styles.stage}
      data-viewport-surface=""
      data-env={envDark ? "dark" : undefined}
      data-scrubbing={scrubbing ? "" : undefined}
      data-immersive={immersive ? "" : undefined}
      /* In the immersive state the ground around the photograph is a way
         out, the way it is in any viewer worth using. The photograph's own
         button stops the event, so this only ever fires on the surround. */
      onClick={immersive ? () => setImmersive(false) : undefined}
      style={
        {
          "--tone": day.photo.tone ?? "var(--ground)",
          "--lightness": day.photo.lightness ?? 0.5,
          /* The current photograph's shape, so a stacked layout can size its
             frame to the picture rather than to a guess. */
          "--ratio": day.photo.width / day.photo.height,
        } as React.CSSProperties
      }
    >
      <p className={styles.position} role="status" aria-live="polite">
        {relative ?? stamp(day.date)}
        <span className={styles.of}>
          {display + 1} of {count}
        </span>
      </p>

      {/* The stack. Every mounted day is here; the frame loop decides where
          each one stands. */}
      <div className={styles.gallery}>
        {visible.map(({ day: d, index }) => (
          <figure
            key={d.date}
            ref={(el) => {
              if (el) slides.current.set(d.date, el);
              else slides.current.delete(d.date);
            }}
            className={styles.slide}
            data-shape={shapeOf(d)}
            data-current={index === display ? "" : undefined}
            aria-hidden={index === display ? undefined : true}
            style={initial(index - display)}
          >
            {/* A real button, not a click handler on an image. The
                photograph is the primary control on this screen and has to be
                reachable by keyboard like any other. */}
            <button
              type="button"
              className={styles.frame}
              tabIndex={index === display ? 0 : -1}
              aria-label={
                immersive ? "Close full screen" : "View this photograph full screen"
              }
              onClick={(e) => {
                e.stopPropagation();
                if (index === display) setImmersive((v) => !v);
              }}
            >
              <img
                src={bestRendition(d.photo)}
                alt={index === display ? d.photo.alt : ""}
                width={d.photo.width}
                height={d.photo.height}
                draggable={false}
                style={
                  d.photo.focal
                    ? { objectPosition: `${d.photo.focal[0] * 100}% ${d.photo.focal[1] * 100}%` }
                    : undefined
                }
              />
            </button>
          </figure>
        ))}
      </div>

      {/* The writing, in its own column so the photograph can never sit on
          top of it. */}
      <div className={styles.type} ref={type}>
        <div className={styles.legend}>
          <h1 className={styles.heading}>
            <time className={styles.date} dateTime={day.date}>
              {full(day.date)}
            </time>
          </h1>

          <p className={styles.measure}>
            {day.place?.label && <span className={styles.place}>{day.place.label}</span>}
            <span className={styles.readout}>
              {day.capturedAt && <span>{clockTime(day.capturedAt, captureZone)}</span>}
              {day.weather?.temperatureC !== undefined && (
                <span>{Math.round(day.weather.temperatureC)}&deg;C</span>
              )}
              {day.weather?.conditions && <span>{day.weather.conditions}</span>}
            </span>
          </p>

          {day.note && <p className={styles.note}>{day.note}</p>}

          {status && !status.todayRecorded && display === 0 && (
            <p className={styles.unrecorded}>Today remains unrecorded.</p>
          )}
        </div>

        {/* Beneath the writing rather than behind it. Running the year under
            the text read as clutter and under the photograph read as an
            obstruction; below, bleeding off two edges, it is architecture the
            writing stands on. */}
        <p className={styles.monument} aria-hidden="true">
          {yearOf(day.date)}
        </p>
      </div>

      {/* In the immersive state the writing collapses to one line, which sits
          in whatever band the photograph's shape has left over. When the
          orientation matches the screen there is barely a band and this rides
          quietly along the bottom edge; when it does not, the leftover space
          carries the day rather than sitting empty. */}
      <p className={styles.caption} aria-hidden={!immersive}>
        <span>{stamp(day.date)}</span>
        {day.place?.label && <span>{day.place.label}</span>}
        {day.capturedAt && <span>{clockTime(day.capturedAt, captureZone)}</span>}
      </p>

      {/* At speed the dates take over from the photographs, because at speed
          nobody is looking at the photographs. */}
      <p className={styles.scrub} aria-hidden="true">
        {stamp(day.date)}
      </p>
    </div>
  );
}

/**
 * Where a day stands, given its distance from the front of the stack.
 *
 * Shared by the render and by the frame loop on purpose. The server and the
 * first client paint have to agree with what the loop will write a frame
 * later, or every mounted day flashes on screen stacked on top of the others
 * before the first animation frame tidies them away.
 */
function initial(d: number): React.CSSProperties {
  const at = place(d);
  return {
    transform: at.transform,
    opacity: at.opacity,
    zIndex: at.zIndex,
    visibility: at.hidden ? "hidden" : "visible",
  };
}

function place(d: number) {
  const away = Math.abs(d);
  /* Eased rather than linear, and reaching zero at exactly one day away.
     A linear falloff left the next day sitting at a third of full strength
     while the archive was standing still, which read as a printing error
     rather than as depth. Now a neighbour is only present while it is
     actually being travelled toward. */
  const opacity = away >= 1 ? 0 : Math.pow(1 - away, 0.8);
  return {
    transform: `translate3d(0, ${d * 3.2}vh, 0) scale(${1 - d * 0.075})`,
    opacity,
    zIndex: 100 - Math.round(away * 10),
    hidden: opacity <= 0.01,
  };
}

function shapeOf(day: ResolvedDay): "landscape" | "portrait" | "square" {
  if (day.photo.width === day.photo.height) return "square";
  return day.photo.width > day.photo.height ? "landscape" : "portrait";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
