import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  archive,
  DEPARTMENT_LIST,
  DEPARTMENTS,
  type DepartmentCode,
} from "@/lib/archive";
import { Mosaic } from "@/components/archive/Mosaic";
import { DepartmentFilter } from "@/components/archive/DepartmentFilter";
import { Reveal } from "@/components/primitives/Reveal";
import { Masthead, PageFoot, mastheadStyles } from "@/components/primitives/Masthead";
import styles from "../archive.module.css";

interface Params {
  params: Promise<{ dept: string }>;
}

export async function generateStaticParams() {
  return DEPARTMENT_LIST.map((department) => ({ dept: department.slug }));
}

function bySlug(slug: string): DepartmentCode | null {
  return DEPARTMENT_LIST.find((d) => d.slug === slug)?.code ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { dept } = await params;
  const code = bySlug(dept);
  if (!code) return { title: "Department not found" };

  return {
    title: DEPARTMENTS[code].name,
    description: DEPARTMENTS[code].charter,
  };
}

export default async function DepartmentPage({ params }: Params) {
  const { dept } = await params;
  const code = bySlug(dept);
  if (!code) notFound();

  const department = DEPARTMENTS[code];
  const [entries, stats] = await Promise.all([
    archive.entries({ dept: code, order: "reverse-chronological" }),
    archive.stats(),
  ]);

  return (
    <div className={styles.page} data-dept={code}>
      <Masthead title={department.name} charter={department.charter} />

      <DepartmentFilter
        counts={stats.byDepartment}
        total={stats.total}
        active={code}
      />

      {entries.length === 0 ? (
        <div className={styles.vacantWrap}>
          <Reveal el="p" className={styles.vacant}>
            The department has been constituted but holds nothing yet. Its
            first accession will appear here.
          </Reveal>
        </div>
      ) : (
        <Mosaic entries={entries} />
      )}

      <PageFoot>
        <span>
          {entries.length} of {stats.total} records
        </span>
        <span>
          <Link href="/archive" className={mastheadStyles.footLink}>
            All departments
          </Link>
        </span>
      </PageFoot>
    </div>
  );
}
