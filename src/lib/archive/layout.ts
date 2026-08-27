import type { EntrySummary, DepartmentCode, Significance } from "./schema";

/* =========================================================================
   Mosaic packing

   How much of the page a record claims is a function of what kind of
   record it is and how significant the archive considers it. That much was
   always the intention. What did not work was leaving the packing to CSS.

   `grid-auto-flow: dense` fills horizontally but a grid row is as tall as
   its tallest member, so a portrait object beside a landscape place leaves
   a column of dead paper underneath the shorter of the two. At this
   variety of proportions the result reads as a page with holes in it
   rather than as a composition.

   So the rows are packed here instead, greedily, and each is rendered as
   its own grid whose columns are the members' own widths. Rows cannot
   interfere with each other's heights, nothing has to be measured, and the
   result is stable between server and client.
   ========================================================================= */

/** Columns a record claims on the full twelve-column grid. */
const BASE: Record<DepartmentCode, number> = {
  OB: 3,
  FN: 4,
  DR: 5,
  PH: 5,
  PL: 6,
  XP: 6,
  AU: 6,
  TH: 12,
};

/** Records the archive is prepared to make a claim about get more room. */
const CONSIDERABLE: Partial<Record<DepartmentCode, number>> = {
  OB: 4,
  FN: 6,
  DR: 7,
  PH: 7,
  PL: 8,
};

const COLUMNS = 12;

export function spanOf(dept: DepartmentCode, significance: Significance): number {
  if (dept === "TH") return COLUMNS;
  /* Set small, deliberately. A record of negligible significance that
     occupied half the page would be making a claim the metadata denies. */
  if (significance === "negligible") return 3;
  if (significance === "considerable") return CONSIDERABLE[dept] ?? BASE[dept];
  return BASE[dept];
}

export interface MosaicItem {
  entry: EntrySummary;
  span: number;
}

export type MosaicRow = MosaicItem[];

/**
 * Packs records into rows of twelve columns, in the order given.
 *
 * Greedy rather than optimal: order is chronological and carries meaning,
 * so records are never rearranged to achieve a tighter fit. A row that
 * comes up short ends in air rather than stretching to close the gap —
 * see `templateFor`.
 */
export function packMosaic(entries: EntrySummary[]): MosaicRow[] {
  const rows: MosaicRow[] = [];
  let row: MosaicRow = [];
  let filled = 0;

  const close = () => {
    if (row.length > 0) rows.push(row);
    row = [];
    filled = 0;
  };

  for (const entry of entries) {
    const span = spanOf(entry.dept, entry.significance);

    /* A thought is a full-width pause in the rhythm and never shares. */
    if (span >= COLUMNS) {
      close();
      rows.push([{ entry, span }]);
      continue;
    }

    if (filled + span > COLUMNS) close();

    row.push({ entry, span });
    filled += span;
  }

  close();
  return rows;
}

/**
 * The row's own column definition — `5fr 4fr 3fr` for a row holding a
 * five-column and a four-column record.
 *
 * The trailing track is the unfilled remainder, and it matters. Without
 * it the members' `fr` units divide the full width between them, so a row
 * that only reached nine columns renders a five-column record at eight —
 * the grid silently stops meaning anything and the largest records are the
 * ones in the emptiest rows. A short row is supposed to end in air.
 */
export function templateFor(row: MosaicRow): string {
  const filled = row.reduce((total, item) => total + item.span, 0);
  const tracks = row.map((item) => `${item.span}fr`);
  const remainder = COLUMNS - filled;
  if (remainder > 0) tracks.push(`${remainder}fr`);
  return tracks.join(" ");
}
