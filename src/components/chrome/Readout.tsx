"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { lightOf, moonPhase, seasonOf } from "@/lib/util/time";
import styles from "./Readout.module.css";

interface Local {
  time: string;
  season: string;
  light: string;
  moon: string;
  illumination: number;
}

const SEASON_LABEL: Record<string, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
};

/**
 * Everything here depends on the reader's own clock, which the server does
 * not have. Rather than guess and then correct — which would show as a
 * flicker on every load — the time-dependent values render as held space
 * and fill in on mount. The record count, which the server does know, is
 * correct in the first byte of HTML.
 */
export function Readout({
  holdings,
  placed,
  latest,
}: {
  holdings: number;
  placed: number;
  latest?: string;
}) {
  const [local, setLocal] = useState<Local | null>(null);

  useEffect(() => {
    const read = () => {
      const now = new Date();
      const phase = moonPhase(now);
      setLocal({
        time: now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        season: SEASON_LABEL[seasonOf(now)] ?? "",
        light: lightOf(now) === "dark" ? "After dark" : "Daylight",
        moon: phase.name,
        illumination: phase.illumination,
      });
    };

    read();
    /* On the minute, not on a second's interval. There is nothing here
       that changes faster than that. */
    const timer = window.setInterval(read, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.readout}>
      <span className={styles.item}>
        <span className={styles.key}>Holdings</span>
        <span className={styles.value}>{String(holdings).padStart(4, "0")}</span>
      </span>

      <span className={styles.item} data-optional="true">
        <span className={styles.key}>Placed</span>
        <span className={styles.value}>{String(placed).padStart(4, "0")}</span>
      </span>

      {latest && (
        <span className={styles.item} data-optional="true">
          <span className={styles.key}>Latest</span>
          <span className={styles.value}>{latest.replace(/-/g, ".")}</span>
        </span>
      )}

      <span className={styles.spacer} />

      <span className={styles.item} data-optional="true">
        <span className={styles.key}>Season</span>
        <span className={local ? styles.value : styles.pending}>
          {local?.season ?? "—"}
        </span>
      </span>

      <span className={styles.item} data-optional="true">
        <span className={styles.key}>Moon</span>
        <span
          className={styles.moon}
          style={{ "--lit": `${Math.round((local?.illumination ?? 0) * 100)}%` } as CSSProperties}
          aria-hidden="true"
        />
        <span className={local ? styles.value : styles.pending}>
          {local?.moon ?? "—"}
        </span>
      </span>

      <span className={styles.item}>
        <span className={styles.key}>Local</span>
        <span className={local ? styles.value : styles.pending}>
          {local ? `${local.time} · ${local.light}` : "—"}
        </span>
      </span>
    </div>
  );
}
