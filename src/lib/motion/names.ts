/* =========================================================================
   Transition names

   Deliberately a plain module with no "use client" boundary: both halves
   of a transition need to agree on the name, and one of those halves is
   usually rendered on the server.

   A name is derived from the accession number alone, so the element being
   navigated away from and the element being navigated to arrive at the
   same string without either of them knowing about the other.
   ========================================================================= */

/** The name carried by a record's plate, on any surface that shows it. */
export function plateName(id: string): string {
  return `plate-${id.replace(/[^A-Za-z0-9-]/g, "")}`;
}

/** The name carried by a record's title where it should stay continuous. */
export function titleName(id: string): string {
  return `title-${id.replace(/[^A-Za-z0-9-]/g, "")}`;
}
