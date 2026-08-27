import {
  DEPARTMENTS,
  type AccessionId,
  type DepartmentCode,
} from "./schema";

/* =========================================================================
   Accession numbers

   Canonical form is LN-XX-0000 — hyphens, so the value passes through
   URLs, filenames, query strings and SQL without transformation.

   Display form is LN–XX–0000 — en-dashes, because that is what the
   institution prints. The two are never confused: `format` is the only
   place the en-dash is introduced, and it is presentation only.
   ========================================================================= */

const CANONICAL = /^LN-(OB|PL|FN|PH|TH|AU|XP|DR)-(\d{4})$/;

export interface ParsedAccession {
  dept: DepartmentCode;
  sequence: number;
  canonical: AccessionId;
}

/** Parse a canonical or display-form accession number. Returns null if malformed. */
export function parseAccession(value: string): ParsedAccession | null {
  const canonical = value.trim().toUpperCase().replace(/[–—]/g, "-");
  const match = CANONICAL.exec(canonical);
  if (!match) return null;

  const [, dept, digits] = match;
  return {
    dept: dept as DepartmentCode,
    sequence: Number(digits),
    canonical: canonical as AccessionId,
  };
}

export function isAccession(value: string): boolean {
  return parseAccession(value) !== null;
}

/** LN-OB-0041 → LN–OB–0041. Use for anything a reader sees. */
export function format(id: AccessionId): string {
  return id.replace(/-/g, "–");
}

/** LN-OB-0041 → OB */
export function departmentOf(id: AccessionId): DepartmentCode {
  return id.slice(3, 5) as DepartmentCode;
}

/** LN-OB-0041 → 41 */
export function sequenceOf(id: AccessionId): number {
  return Number(id.slice(6));
}

export function mint(dept: DepartmentCode, sequence: number): AccessionId {
  return `LN-${dept}-${String(sequence).padStart(4, "0")}` as AccessionId;
}

/**
 * The next number the registry would issue for a department. Sequences are
 * per-department and never reused, including after a withdrawal.
 */
export function nextInSequence(
  dept: DepartmentCode,
  existing: readonly AccessionId[],
): AccessionId {
  const highest = existing
    .filter((id) => departmentOf(id) === dept)
    .reduce((max, id) => Math.max(max, sequenceOf(id)), 0);
  return mint(dept, highest + 1);
}

/**
 * Registry order: department first (in charter order, not alphabetical),
 * then sequence. This is the order the physical ledger would be in.
 */
export function byAccession(a: AccessionId, b: AccessionId): number {
  const codes = Object.keys(DEPARTMENTS) as DepartmentCode[];
  const deptDelta =
    codes.indexOf(departmentOf(a)) - codes.indexOf(departmentOf(b));
  return deptDelta !== 0 ? deptDelta : sequenceOf(a) - sequenceOf(b);
}

/**
 * A stable 32-bit hash of the accession number, used to seed every
 * generative plate. The same record always draws the same plate — on every
 * device, in every session, forever. That permanence is the whole point.
 */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
