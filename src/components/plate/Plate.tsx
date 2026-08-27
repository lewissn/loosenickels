"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEPARTMENTS, seedOf, format, type DepartmentCode } from "@/lib/archive";
import { PLATE_SYSTEMS, registration, type PlateContext } from "./systems";
import styles from "./Plate.module.css";

interface PlateProps {
  /** The accession number. Seeds the drawing and labels it. */
  id: string;
  dept: DepartmentCode;
  /** Suppresses the legend and reduces insets, for small thumbnails. */
  compact?: boolean;
  /** Set on the element that must stay continuous across a navigation. */
  viewTransitionName?: string;
  className?: string;
}

/** `rgb(26, 25, 21)`, `rgb(26 25 21 / 0.4)` and `#1a1915` all resolve here. */
function parseColour(value: string): [number, number, number] {
  const numeric = value.match(/-?[\d.]+/g);
  if (numeric && value.trim().startsWith("rgb")) {
    const [r, g, b] = numeric;
    return [Number(r) || 0, Number(g) || 0, Number(b) || 0];
  }

  const hex = value.trim().replace("#", "");
  if (hex.length === 6 || hex.length === 3) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }

  return [26, 25, 21];
}

/**
 * A record with no digitised media draws its plate.
 *
 * The drawing is a function of the accession number alone, so it is stable
 * forever and identical everywhere. Real media, once attached to a record,
 * takes precedence and this never renders.
 */
export function Plate({
  id,
  dept,
  compact = false,
  viewTransitionName,
  className,
}: PlateProps) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  const draw = useCallback(() => {
    const node = canvas.current;
    const box = holder.current;
    if (!node || !box) return;

    const { width, height } = box.getBoundingClientRect();
    if (width < 2 || height < 2) return;

    /* Two is the point past which more pixels are not visible on any
       display this will run on, and the cost is quadratic. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    node.width = Math.round(width * dpr);
    node.height = Math.round(height * dpr);

    const ctx = node.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    /* Colours are read from the cascade rather than hard-coded, so a plate
       is drawn in whatever the institution's palette currently is. */
    const computed = getComputedStyle(box);
    const plate: PlateContext = {
      ctx,
      w: width,
      h: height,
      seed: seedOf(id),
      ink: parseColour(computed.getPropertyValue("--ink")),
      env: parseColour(computed.getPropertyValue("--env")),
      oxide: parseColour(computed.getPropertyValue("--oxide")),
    };

    PLATE_SYSTEMS[DEPARTMENTS[dept].plate](plate);
    if (!compact) registration(plate);

    setDrawn(true);
  }, [compact, dept, id]);

  useEffect(() => {
    const box = holder.current;
    if (!box) return;

    /* The first draw is synchronous. Scheduling it on an animation frame
       would be marginally tidier and would also mean the plate never
       appears in any context where frames are not being produced — a
       background tab, a headless capture, a device that throttles rAF
       aggressively. Subsequent draws are coalesced, because resize events
       arrive in bursts and redrawing a contour field per event is waste. */
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    draw();

    /* Redraw on resize — a canvas scaled by CSS is a blurred canvas. */
    const resize = new ResizeObserver(schedule);
    resize.observe(box);

    /* Redraw when the institution moves between day and night. */
    const theme = new MutationObserver(schedule);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-light"],
    });

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      theme.disconnect();
    };
  }, [draw]);

  const department = DEPARTMENTS[dept];

  return (
    <div
      ref={holder}
      data-dept={dept}
      className={[styles.plate, compact ? styles.compact : "", className]
        .filter(Boolean)
        .join(" ")}
      style={viewTransitionName ? { viewTransitionName } : undefined}
    >
      <canvas
        ref={canvas}
        className={styles.canvas}
        data-drawn={drawn}
        role="img"
        aria-label={`Generative plate for ${format(id)}, drawn in the ${department.name.toLowerCase()} convention. The record is not yet digitised.`}
      />
      <span className={styles.wash} aria-hidden="true" />
      {!compact && (
        <div className={styles.legend}>
          <span>{format(id)}</span>
          <span className={styles.condition} aria-hidden="true">
            Awaiting digitisation
          </span>
        </div>
      )}
    </div>
  );
}
