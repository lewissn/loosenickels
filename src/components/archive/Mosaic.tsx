import { packMosaic, templateFor } from "@/lib/archive/layout";
import type { EntrySummary } from "@/lib/archive";
import { RecordCard } from "./RecordCard";
import { Reveal } from "@/components/primitives/Reveal";
import styles from "./Mosaic.module.css";

/**
 * The archive index, packed into rows.
 *
 * Each row is its own grid, so a tall record cannot open a hole underneath
 * a short one. Widths come from the records themselves — department and
 * recorded significance — which means the page composes differently as the
 * archive grows and as its opinion of its own holdings changes.
 */
export function Mosaic({ entries }: { entries: EntrySummary[] }) {
  const rows = packMosaic(entries);
  let seen = 0;

  return (
    <div className={styles.mosaic}>
      {rows.map((row, r) => {
        const rowStart = seen;
        seen += row.length;

        return (
          <div
            key={row[0]?.entry.id ?? r}
            className={styles.row}
            style={{ gridTemplateColumns: templateFor(row) }}
          >
            {row.map((item, i) => (
              <Reveal
                key={item.entry.id}
                el="div"
                className={styles.cell}
                /* Members of a row arrive together, left to right. The
                   stagger is dropped after the first few rows so a reader
                   who scrolls quickly is never waiting on the interface. */
                delay={rowStart < 8 ? (rowStart + i) * 60 : 0}
                data-dept={item.entry.dept}
              >
                <RecordCard entry={item.entry} />
              </Reveal>
            ))}
          </div>
        );
      })}
    </div>
  );
}
