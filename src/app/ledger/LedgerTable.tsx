"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./ledger.module.css";

export interface LedgerRow {
  /** Position in registry order, assigned by the source. */
  seq: number;
  id: string;
  display: string;
  slug: string;
  title: string;
  department: string;
  date: string;
  position?: string;
  significance: string;
}

type Column = "id" | "title" | "department" | "date" | "significance";

const COLUMNS: { key: Column; label: string; className?: string }[] = [
  { key: "id", label: "Accession" },
  { key: "department", label: "Class" },
  { key: "title", label: "Record" },
  { key: "date", label: "Date" },
  { key: "significance", label: "Significance" },
];

/**
 * The register, sortable by any column it prints.
 *
 * Sorting is done in the client against a payload that is already present,
 * so a column reorders between one frame and the next. The archive is
 * small enough that this is trivially correct; the point of doing it at
 * all is that a register you cannot reorder is a printout, not a register.
 */
export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const [column, setColumn] = useState<Column>("id");
  const [descending, setDescending] = useState(false);

  const sorted = useMemo(() => {
    const collator = new Intl.Collator("en-GB", { numeric: true });
    const ordered = [...rows].sort((a, b) => {
      /* The accession column sorts by registry position rather than by the
         text of the number. Departments run in charter order, not
         alphabetically, and the string does not encode that. */
      const value =
        column === "id"
          ? a.seq - b.seq
          : collator.compare(a[column], b[column]);
      /* Ties fall back to registry order, so the register never shuffles
         rows that compare equal. */
      return value !== 0 ? value : a.seq - b.seq;
    });
    return descending ? ordered.reverse() : ordered;
  }, [column, descending, rows]);

  const toggle = (next: Column) => {
    if (next === column) setDescending((was) => !was);
    else {
      setColumn(next);
      setDescending(false);
    }
  };

  return (
    <>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <caption className="sr">
            The accession register. Every public record held by the institute,
            sortable by accession number, class, title, date or significance.
          </caption>
          <thead>
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={
                    column === key
                      ? descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className={styles.sort}
                    data-active={column === key}
                    onClick={() => toggle(key)}
                  >
                    {label}
                    <span className={styles.caret} aria-hidden="true">
                      {descending ? "▼" : "▲"}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col">Position</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className={styles.row}>
                <td className={styles.id}>{row.display}</td>
                <td className={styles.class}>{row.department}</td>
                <td className={styles.entry}>
                  <Link href={`/archive/record/${row.slug}`}>{row.title}</Link>
                </td>
                <td className={styles.date}>{row.date.replace(/-/g, ".")}</td>
                <td className={styles.significance} data-value={row.significance}>
                  {row.significance}
                </td>
                <td className={row.position ? styles.position : styles.unplaced}>
                  {row.position ?? "unplaced"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.controls}>
        <span>
          {sorted.length} records · sorted by {column}
          {descending ? ", descending" : ", ascending"}
        </span>
        <span>Any column heading reorders the register.</span>
      </div>
    </>
  );
}
