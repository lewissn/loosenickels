import type { Metadata } from "next";
import Link from "next/link";
import { archive } from "@/lib/archive";
import { Mosaic } from "@/components/archive/Mosaic";
import { DepartmentFilter } from "@/components/archive/DepartmentFilter";
import { Masthead, PageFoot, mastheadStyles } from "@/components/primitives/Masthead";
import { longDate } from "@/lib/util/time";
import styles from "./archive.module.css";

export const metadata: Metadata = {
  title: "The Archive",
  description:
    "Every record held by the institute, arranged by date of accession.",
};

export default async function ArchiveIndex() {
  const [entries, stats] = await Promise.all([
    archive.entries({ order: "reverse-chronological" }),
    archive.stats(),
  ]);

  return (
    <div className={styles.page}>
      <Masthead
        title="The Archive"
        charter="Objects, places, observations and other material of uncertain importance, arranged by the date each was made rather than the date it was taken in."
      />

      <DepartmentFilter counts={stats.byDepartment} total={stats.total} />

      <Mosaic entries={entries} />

      <PageFoot>
        <span>
          {stats.total} records · {stats.undetermined} of undetermined
          significance
          {stats.earliest && ` · earliest ${longDate(stats.earliest)}`}
        </span>
        <span>
          <Link href="/ledger" className={mastheadStyles.footLink}>
            View as ledger
          </Link>
        </span>
      </PageFoot>
    </div>
  );
}
