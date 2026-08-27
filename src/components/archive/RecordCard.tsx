import { DEPARTMENTS, format, type EntrySummary } from "@/lib/archive";
import { Plate } from "@/components/plate/Plate";
import { RecordLink } from "./RecordLink";
import { monthYear } from "@/lib/util/time";
import styles from "./RecordCard.module.css";

interface RecordCardProps {
  entry: EntrySummary;
  /** Suppresses the summary line where the layout is already dense. */
  terse?: boolean;
}

/**
 * A record as it appears in an index.
 *
 * The department decides the shape. Thoughts are the exception that proves
 * the system: they have no plate, no frame and no caption block, and in a
 * page of plates they are what stops the grid becoming a grid.
 */
export function RecordCard({ entry, terse = false }: RecordCardProps) {
  const href = `/archive/record/${entry.slug}`;
  const department = DEPARTMENTS[entry.dept];

  if (entry.dept === "TH") {
    return (
      <article className={styles.thought} data-dept="TH" data-record={entry.id}>
        <p className={styles.thoughtText}>
          <RecordLink href={href} id={entry.id}>
            {entry.title}
          </RecordLink>
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
    <article className={styles.card} data-dept={entry.dept} data-record={entry.id}>
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
            data-plate=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Plate id={entry.id} dept={entry.dept} compact />
        )}
      </span>

      <div className={styles.caption}>
        <span className={styles.id}>{format(entry.id)}</span>
        <span className={styles.dept}>{department.singular}</span>
        <h3 className={styles.title}>
          <RecordLink href={href} id={entry.id} className={styles.reach}>
            {entry.title}
          </RecordLink>
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
