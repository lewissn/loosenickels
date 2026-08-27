import Link from "next/link";
import { DEPARTMENTS, format, type EntrySummary } from "@/lib/archive";
import { Plate } from "@/components/plate/Plate";
import { plateName } from "@/lib/motion/names";
import { monthYear } from "@/lib/util/time";
import styles from "./RecordCard.module.css";

interface RecordCardProps {
  entry: EntrySummary;
  /** Suppresses the summary line where the layout is already dense. */
  terse?: boolean;
  /**
   * Whether this card should carry the plate's transition name. Only one
   * element per document may claim a given name, so an index that shows a
   * record twice must name it once.
   */
  continuous?: boolean;
}

/**
 * A record as it appears in an index.
 *
 * The department decides the shape. Thoughts are the exception that proves
 * the system: they have no plate, no frame and no caption block, and in a
 * page of plates they are what stops the grid becoming a grid.
 */
export function RecordCard({
  entry,
  terse = false,
  continuous = true,
}: RecordCardProps) {
  const href = `/archive/record/${entry.slug}`;
  const department = DEPARTMENTS[entry.dept];

  if (entry.dept === "TH") {
    return (
      <article className={styles.thought} data-dept="TH">
        <p className={styles.thoughtText}>
          <Link href={href}>{entry.title}</Link>
        </p>
        <p className={styles.thoughtMeta}>
          <em>Thought</em>
          <span>{format(entry.id)}</span>
          <span>{monthYear(entry.date)}</span>
        </p>
      </article>
    );
  }

  const where = entry.place
    ? [entry.place.name, entry.place.region].filter(Boolean).join(", ")
    : null;

  return (
    <article className={styles.card} data-dept={entry.dept}>
      <span className={styles.frame}>
        {entry.thumbnail ? (
          /* Real media, once it exists, always takes precedence over the
             generative plate. eslint-disable is not needed here: the image
             pipeline supplies intrinsic dimensions with every record. */
          <img
            src={entry.thumbnail.src}
            alt={entry.thumbnail.alt}
            width={entry.thumbnail.width}
            height={entry.thumbnail.height}
            loading="lazy"
            decoding="async"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              ...(continuous ? { viewTransitionName: plateName(entry.id) } : {}),
            }}
          />
        ) : (
          <Plate
            id={entry.id}
            dept={entry.dept}
            compact
            viewTransitionName={continuous ? plateName(entry.id) : undefined}
          />
        )}
      </span>

      <div className={styles.caption}>
        <span className={styles.id}>{format(entry.id)}</span>
        <span className={styles.dept}>{department.singular}</span>
        <h3 className={styles.title}>
          <Link href={href} className={styles.reach}>
            {entry.title}
          </Link>
        </h3>
        {!terse && entry.summary && (
          <p className={styles.summary}>{entry.summary}</p>
        )}
        <p className={styles.where}>
          {where ? `${where} · ` : ""}
          {monthYear(entry.date)}
        </p>
      </div>
    </article>
  );
}
