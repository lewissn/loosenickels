import Link from "next/link";
import { DEPARTMENT_LIST, type DepartmentCode } from "@/lib/archive";
import styles from "./DepartmentFilter.module.css";

interface DepartmentFilterProps {
  counts: Record<DepartmentCode, number>;
  total: number;
  /** Null on the combined index. */
  active?: DepartmentCode | null;
}

export function DepartmentFilter({
  counts,
  total,
  active = null,
}: DepartmentFilterProps) {
  return (
    <nav className={styles.filter} aria-label="Filter by department">
      <Link
        href="/archive"
        className={styles.item}
        aria-current={active === null ? "page" : undefined}
      >
        Everything
        <span className={styles.count}>{String(total).padStart(3, "0")}</span>
      </Link>

      {DEPARTMENT_LIST.map((department) => (
        <Link
          key={department.code}
          href={`/archive/${department.slug}`}
          className={styles.item}
          data-empty={counts[department.code] === 0}
          aria-current={active === department.code ? "page" : undefined}
        >
          {department.name}
          <span className={styles.count}>
            {String(counts[department.code]).padStart(3, "0")}
          </span>
        </Link>
      ))}
    </nav>
  );
}
