import Link from "next/link";
import type { ReactNode } from "react";
import { DEPARTMENTS, format, type Entry } from "@/lib/archive";
import { formatCoordinates, longDate } from "@/lib/util/time";
import styles from "./Metadata.module.css";

const SIGNIFICANCE_PHRASE: Record<string, string> = {
  undetermined: "undetermined",
  negligible: "negligible",
  personal: "personal",
  contested: "contested, internally",
  considerable: "considerable",
};

function titleise(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function Row({
  label,
  children,
  variant,
}: {
  label: string;
  children: ReactNode;
  variant?: "accession" | "significance";
}) {
  return (
    <div className={[styles.row, variant && styles[variant]].filter(Boolean).join(" ")}>
      <dt className={styles.key}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

/**
 * The accession register for a single record.
 *
 * Every row is conditional. A record with no mass has no mass row; a
 * record collected somewhere the archive is unwilling to pin down has a
 * place but no coordinates. The shape of this block is therefore itself a
 * piece of information about the record.
 */
export function Metadata({ entry }: { entry: Entry }) {
  const department = DEPARTMENTS[entry.dept];
  const coordinates = entry.place?.coordinates;

  return (
    <>
      <dl className={styles.metadata}>
        <Row label="Accession" variant="accession">
          {format(entry.id)}
        </Row>

        <Row label="Class">
          <Link href={`/archive/${department.slug}`} className={styles.link}>
            {department.singular}
          </Link>
        </Row>

        <Row label="Date">{longDate(entry.date)}</Row>

        {entry.acquired && entry.acquired !== entry.date && (
          <Row label="Acquired">{longDate(entry.acquired)}</Row>
        )}

        {entry.place && (
          <Row label="Location">
            {[entry.place.name, entry.place.region].filter(Boolean).join(", ")}
          </Row>
        )}

        {coordinates && (
          <Row label="Coordinates">
            <Link
              href={`/places?record=${entry.id}`}
              className={styles.coordinates}
            >
              {formatCoordinates(coordinates.lat, coordinates.lon)}
            </Link>
          </Row>
        )}

        {coordinates?.elevation !== undefined && (
          <Row label="Elevation">{coordinates.elevation} m</Row>
        )}

        {coordinates?.precision !== undefined && (
          <Row label="Positional accuracy">± {coordinates.precision} m</Row>
        )}

        {entry.material && <Row label="Material">{entry.material}</Row>}
        {entry.dimensions && <Row label="Dimensions">{entry.dimensions}</Row>}
        {entry.mass && <Row label="Mass">{entry.mass}</Row>}
        {entry.weather && <Row label="Conditions">{entry.weather}</Row>}
        {entry.source && <Row label="Source">{entry.source}</Row>}

        {entry.collections.length > 0 && (
          <Row label={entry.collections.length === 1 ? "Collection" : "Collections"}>
            <span className={styles.links}>
              {entry.collections.map((slug) => (
                <Link
                  key={slug}
                  href={`/collections/${slug}`}
                  className={styles.link}
                >
                  {titleise(slug)}
                </Link>
              ))}
            </span>
          </Row>
        )}

        <Row label="Significance" variant="significance">
          {SIGNIFICANCE_PHRASE[entry.significance] ?? entry.significance}
        </Row>

        {entry.status !== "accessioned" && (
          <Row label="Status">{entry.status}</Row>
        )}
      </dl>

      {entry.remark && <p className={styles.remark}>{entry.remark}</p>}
    </>
  );
}
