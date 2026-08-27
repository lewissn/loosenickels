import { archive, DEPARTMENT_LIST } from "@/lib/archive";
import { RailChrome, type IndexDepartment } from "./RailChrome";

/**
 * Server half of the rail: gathers what the index layer needs to render
 * without a round trip, and hands it to the interactive half.
 *
 * The layer is populated up front rather than fetched on open, because a
 * navigation surface that has to load is a navigation surface that feels
 * slow, however briefly.
 */
export async function Rail() {
  const [stats, collections] = await Promise.all([
    archive.stats(),
    archive.collections(),
  ]);

  /* A department appears in the index once it holds something, and not
     before. The full scheme is a matter of record on the About page; the
     navigation is a statement of what is actually here. An institution
     that advertises eight departments and can only show you four has told
     you something about itself it did not mean to. */
  const departments: IndexDepartment[] = DEPARTMENT_LIST.filter(
    (department) => stats.byDepartment[department.code] > 0,
  ).map((department) => ({
    code: department.code,
    name: department.name,
    slug: department.slug,
    charter: department.charter,
    count: stats.byDepartment[department.code],
  }));

  return (
    <RailChrome
      departments={departments}
      holdings={stats.total}
      collections={collections.length}
      placed={stats.placed}
    />
  );
}
