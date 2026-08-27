"use client";

import { useEffect, useState } from "react";
import { DEPARTMENTS, type DepartmentCode } from "@/lib/archive/schema";
import { format } from "@/lib/archive/accession";
import { dayIndex, featuredFor } from "@/lib/archive/featured";
import { Plate } from "@/components/plate/Plate";
import { Reveal } from "@/components/primitives/Reveal";
import { RecordLink } from "@/components/archive/RecordLink";
import { monthYear } from "@/lib/util/time";
import styles from "./page.module.css";

/** The little the vitrine needs to know about a record to show it. */
export interface OnDisplayRecord {
  id: string;
  slug: string;
  title: string;
  dept: DepartmentCode;
  region?: string;
  date: string;
}

/**
 * The vitrine.
 *
 * Renders the record the build drew, then — once mounted, and only if the
 * build is from an earlier day than the reader is having — replaces it
 * with the one whose turn it actually is. The frame does not change size
 * between the two, so the correction reads as the exhibit changing rather
 * than as the page moving.
 */
export function OnDisplay({
  pool,
  built,
}: {
  pool: OnDisplayRecord[];
  /** The day the site was built, and so the record already in the HTML. */
  built: number;
}) {
  const [day, setDay] = useState(built);

  useEffect(() => {
    const settle = () => setDay(dayIndex());
    settle();

    /* A page left open overnight should turn over with the day rather
       than hold yesterday's record until it is reloaded. Checking every
       ten minutes is far more often than necessary and still costs
       nothing worth measuring. */
    const timer = window.setInterval(settle, 600_000);
    return () => window.clearInterval(timer);
  }, []);

  const featured = featuredFor(pool, day);
  if (!featured) return null;

  const department = DEPARTMENTS[featured.dept];

  return (
    <div
      className={styles.exhibit}
      data-dept={featured.dept}
      data-record={featured.id}
    >
      <Reveal as="wipe" delay={120}>
        <RecordLink
          href={`/archive/record/${featured.slug}`}
          id={featured.id}
          className={styles.frame}
          aria-label={`On display: ${featured.title}, ${format(featured.id)}`}
        >
          <Plate id={featured.id} dept={featured.dept} />
        </RecordLink>
      </Reveal>

      <Reveal delay={420} className={styles.caption} distance={8}>
        <span className={styles.standing}>On display</span>
        <span className={styles.captionId}>{format(featured.id)}</span>
        <span className={styles.captionTitle}>{featured.title}</span>
        <span className={styles.captionMeta}>
          {department.name}
          {featured.region ? ` · ${featured.region}` : ""} ·{" "}
          {monthYear(featured.date)}
        </span>
      </Reveal>
    </div>
  );
}
