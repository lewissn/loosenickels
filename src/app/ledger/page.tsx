import type { Metadata } from "next";
import Link from "next/link";
import { archive, DEPARTMENTS, format } from "@/lib/archive";
import { Masthead, PageFoot, mastheadStyles } from "@/components/primitives/Masthead";
import { LedgerTable, type LedgerRow } from "./LedgerTable";
import styles from "./ledger.module.css";

export const metadata: Metadata = {
  title: "Ledger",
  description:
    "The accession register in full: every public record held by the institute, one line each.",
};

export default async function LedgerPage() {
  const [entries, stats] = await Promise.all([
    archive.entries({ order: "accession" }),
    archive.stats(),
  ]);

  const rows: LedgerRow[] = entries.map((entry) => ({
    id: entry.id,
    display: format(entry.id),
    slug: entry.slug,
    title: entry.title,
    department: DEPARTMENTS[entry.dept].singular,
    date: entry.date,
    position: entry.place?.coordinates
      ? `${entry.place.coordinates.lat.toFixed(3)}, ${entry.place.coordinates.lon.toFixed(3)}`
      : undefined,
    significance: entry.significance,
  }));

  return (
    <div className={styles.page}>
      <Masthead
        title="Ledger"
        charter="The accession register in full. Sequences run per department and are never reused, including after a withdrawal."
      />

      <LedgerTable rows={rows} />

      <PageFoot>
        <span>
          {stats.total} records · {stats.placed} placed · {stats.undetermined} of
          undetermined significance
        </span>
        <span>
          <Link href="/archive" className={mastheadStyles.footLink}>
            Return to the archive
          </Link>
        </span>
      </PageFoot>
    </div>
  );
}
