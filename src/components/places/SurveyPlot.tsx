"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { type DepartmentCode } from "@/lib/archive/schema";
import { format } from "@/lib/archive/accession";
import { haversine } from "@/lib/archive/source";
import { formatCoordinates } from "@/lib/util/time";
import styles from "./SurveyPlot.module.css";

export interface PlottedRecord {
  id: string;
  slug: string;
  title: string;
  dept: DepartmentCode;
  department: string;
  lat: number;
  lon: number;
  elevation?: number;
  precision?: number;
  date: string;
}

/** The institute's own position. Every distance on the plot is from here. */
export const INSTITUTE = { lat: 53.7418, lon: -2.0128 };

/* The viewBox is sized to the data, not fixed square.

   Britain is tall and narrow — the recorded extent runs about six degrees
   of latitude against under four of corrected longitude — so a square
   frame either crops the ends off or wastes most of its area. Deriving the
   frame from the extent means `preserveAspectRatio` has nothing left to
   do but centre it. */
const VIEW_LONG = 1000;
const PAD = 76;

/**
 * Equirectangular, with the longitude axis corrected by the cosine of the
 * mid-latitude.
 *
 * At this extent a proper conformal projection would differ by less than a
 * marker's width, and would cost a dependency. The cosine correction is
 * the part that actually matters: without it Britain is drawn about
 * seventy per cent too wide and looks wrong to anybody who has seen a map.
 */
function useProjection(records: PlottedRecord[]) {
  return useMemo(() => {
    const points = [...records, INSTITUTE as unknown as PlottedRecord];
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const midLat = (minLat + maxLat) / 2;
    const k = Math.cos((midLat * Math.PI) / 180);

    /* Guard against a degenerate extent — one record, or several at the
       same position — which would otherwise divide by zero. */
    const spanX = Math.max((maxLon - minLon) * k, 0.02);
    const spanY = Math.max(maxLat - minLat, 0.02);

    /* The longer axis gets the full frame; the shorter one is sized from
       the extent's own proportions. One scale serves both, so the plot is
       never stretched. */
    const portrait = spanY >= spanX;
    const view = portrait
      ? { w: Math.round(VIEW_LONG * (spanX / spanY)) + PAD * 2, h: VIEW_LONG }
      : { w: VIEW_LONG, h: Math.round(VIEW_LONG * (spanY / spanX)) + PAD * 2 };

    const scale = Math.min((view.w - PAD * 2) / spanX, (view.h - PAD * 2) / spanY);

    const cx = (minLon + maxLon) / 2;
    const cy = (minLat + maxLat) / 2;

    const project = (lat: number, lon: number) => ({
      x: view.w / 2 + (lon - cx) * k * scale,
      /* Latitude increases northwards; y increases downwards. */
      y: view.h / 2 - (lat - cy) * scale,
    });

    /* Graticule interval: the largest of these that still yields a
       readable number of lines across the extent. */
    const step =
      [5, 2, 1, 0.5, 0.25, 0.1].find(
        (candidate) => Math.max(maxLat - minLat, maxLon - minLon) / candidate >= 3,
      ) ?? 0.1;

    const lines = {
      lat: [] as number[],
      lon: [] as number[],
    };
    for (let v = Math.floor(minLat / step) * step; v <= maxLat + step; v += step) {
      lines.lat.push(Number(v.toFixed(4)));
    }
    for (let v = Math.floor(minLon / step) * step; v <= maxLon + step; v += step) {
      lines.lon.push(Number(v.toFixed(4)));
    }

    /* Metres per SVG unit, for drawing positional uncertainty to scale. */
    const metresPerUnit = 111_320 / scale;

    return { project, lines, step, metresPerUnit, view };
  }, [records]);
}

function bearing(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLon);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function degreeLabel(value: number, axis: "lat" | "lon"): string {
  const hemisphere =
    axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const magnitude = Math.abs(value);
  const shown = Number.isInteger(magnitude) ? magnitude : magnitude.toFixed(2);
  return `${shown}° ${hemisphere}`;
}

export function SurveyPlot({ records }: { records: PlottedRecord[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const { project, lines, metresPerUnit, view } = useProjection(records);

  /* User units per rendered pixel.
     Everything inside the viewBox scales with the frame, which is right for
     the graticule and the markers and wrong for anything a person has to
     read or hit: at phone width the degree labels resolved to about six
     pixels. Multiplying by this keeps type and touch targets at a constant
     size on screen no matter what size the plot is drawn at. */
  const [unit, setUnit] = useState(1);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      /* preserveAspectRatio="meet" fits by whichever axis binds first. */
      setUnit(Math.max(view.w / width, view.h / height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view.w, view.h]);

  const home = project(INSTITUTE.lat, INSTITUTE.lon);
  const active = records.find((r) => r.id === selected) ?? null;
  const activePoint = active ? project(active.lat, active.lon) : null;

  const distance = active
    ? haversine(INSTITUTE, { lat: active.lat, lon: active.lon })
    : null;
  const heading = active ? bearing(INSTITUTE, active) : null;

  /* Arrow keys step through positions in the order they were accessioned,
     which is the only ordering of a scatter that means anything. */
  const step = (delta: number) => {
    if (records.length === 0) return;
    const at = records.findIndex((r) => r.id === selected);
    const next = records[(at + delta + records.length) % records.length];
    if (next) {
      setSelected(next.id);
      svg.current
        ?.querySelector<SVGGElement>(`[data-id="${next.id}"]`)
        ?.focus();
    }
  };

  return (
    <div className={styles.plot}>
      <div className={styles.canvas} ref={frame}>
        <svg
          ref={svg}
          className={styles.svg}
          viewBox={`0 0 ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`Survey plot of ${records.length} recorded positions`}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              step(1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              step(-1);
            }
          }}
        >
          <g aria-hidden="true">
            {lines.lat.map((lat) => {
              const { y } = project(lat, 0);
              const major = Math.abs(lat % 1) < 1e-6;
              return (
                <g key={`lat-${lat}`}>
                  <line
                    className={`${styles.graticule} ${major ? styles.graticuleMajor : ""}`}
                    x1={0}
                    y1={y}
                    x2={view.w}
                    y2={y}
                  />
                  {major && y > 26 * unit && y < view.h - 30 * unit && (
                    <text
                      className={styles.graticuleLabel}
                      x={7 * unit}
                      y={y - 5 * unit}
                      style={{ fontSize: `${10 * unit}px` }}
                    >
                      {degreeLabel(lat, "lat")}
                    </text>
                  )}
                </g>
              );
            })}
            {lines.lon.map((lon) => {
              const { x } = project(0, lon);
              const major = Math.abs(lon % 1) < 1e-6;
              return (
                <g key={`lon-${lon}`}>
                  <line
                    className={`${styles.graticule} ${major ? styles.graticuleMajor : ""}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={view.h}
                  />
                  {major && x > 64 * unit && (
                    <text
                      className={styles.graticuleLabel}
                      x={x + 5 * unit}
                      y={view.h - 8 * unit}
                      style={{ fontSize: `${10 * unit}px` }}
                    >
                      {degreeLabel(lon, "lon")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {activePoint && (
            <line
              className={styles.bearingLine}
              x1={home.x}
              y1={home.y}
              x2={activePoint.x}
              y2={activePoint.y}
              aria-hidden="true"
            />
          )}

          <g aria-hidden="true">
            <circle className={styles.home} cx={home.x} cy={home.y} r={5} />
            <circle className={styles.home} cx={home.x} cy={home.y} r={1.5} />
            <text
              className={styles.homeLabel}
              x={home.x + 10 * unit}
              y={home.y + 3 * unit}
              style={{ fontSize: `${8.5 * unit}px` }}
            >
              The institute
            </text>
          </g>

          {records.map((record) => {
            const { x, y } = project(record.lat, record.lon);
            const ring = record.precision
              ? Math.max(4, record.precision / metresPerUnit)
              : 0;

            return (
              <g
                key={record.id}
                data-id={record.id}
                data-dept={record.dept}
                data-selected={selected === record.id}
                className={styles.marker}
                tabIndex={0}
                role="button"
                aria-label={`${record.title}, ${format(record.id)}. ${record.department}.`}
                onMouseEnter={() => setSelected(record.id)}
                onFocus={() => setSelected(record.id)}
                onClick={() => setSelected(record.id)}
              >
                {ring > 0 && (
                  <circle className={styles.markerPrecision} cx={x} cy={y} r={ring} />
                )}
                {/* An invisible disc gives the marker a target far larger
                    than the cross it draws. */}
                {/* At least 22 rendered pixels of radius, so a survey
                    cross drawn for a pointer is still a thumb target. */}
                <circle
                  className={styles.markerHalo}
                  cx={x}
                  cy={y}
                  r={Math.max(16, 22 * unit)}
                />
                <path
                  className={styles.markerCross}
                  d={`M${x - 7} ${y} H${x - 2.5} M${x + 2.5} ${y} H${x + 7} M${x} ${y - 7} V${y - 2.5} M${x} ${y + 2.5} V${y + 7}`}
                />
                <circle className={styles.markerDot} cx={x} cy={y} r={1.6} />
                <text
                  className={styles.markerLabel}
                  x={x + 11 * unit}
                  y={y - 8 * unit}
                  style={{ fontSize: `${9.5 * unit}px` }}
                >
                  {format(record.id)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <aside className={styles.readout} aria-live="polite">
        <div className={styles.readoutInner}>
        <p className={styles.readoutLabel}>Position</p>

        {active ? (
          <div className={styles.selection}>
            <span className={styles.selectionId}>{format(active.id)}</span>
            <h2 className={styles.selectionTitle}>
              <Link href={`/archive/record/${active.slug}`}>{active.title}</Link>
            </h2>

            <div className={styles.figures}>
              <div className={styles.figure}>
                <span className={styles.figureKey}>Class</span>
                <span className={styles.figureValue}>{active.department}</span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureKey}>Latitude</span>
                <span className={styles.figureValue}>
                  {formatCoordinates(active.lat, active.lon).split("  ")[0]}
                </span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureKey}>Longitude</span>
                <span className={styles.figureValue}>
                  {formatCoordinates(active.lat, active.lon).split("  ")[1]}
                </span>
              </div>
              {active.elevation !== undefined && (
                <div className={styles.figure}>
                  <span className={styles.figureKey}>Elevation</span>
                  <span className={styles.figureValue}>{active.elevation} m</span>
                </div>
              )}
              {distance !== null && (
                <div className={styles.figure}>
                  <span className={styles.figureKey}>From the institute</span>
                  <span className={styles.figureValue}>
                    {(distance / 1000).toFixed(1)} km
                  </span>
                </div>
              )}
              {heading !== null && (
                <div className={styles.figure}>
                  <span className={styles.figureKey}>Bearing</span>
                  <span className={styles.figureValue}>
                    {Math.round(heading).toString().padStart(3, "0")}° ·{" "}
                    {COMPASS[Math.round(heading / 22.5) % 16]}
                  </span>
                </div>
              )}
              {active.precision !== undefined && (
                <div className={styles.figure}>
                  <span className={styles.figureKey}>Claimed to</span>
                  <span className={styles.figureValue}>± {active.precision} m</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className={styles.idle}>
            No position selected. The dashed rings are the accuracy each
            record is willing to claim, drawn to the same scale as the plot.
          </p>
        )}

        <p className={styles.hint}>
          {records.length} positions
          <br />
          ←→ to step through
        </p>
        </div>
      </aside>
    </div>
  );
}
