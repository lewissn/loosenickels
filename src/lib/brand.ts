/* =========================================================================
   Brand

   The product name is not settled. Every piece of user-facing naming
   resolves here so that changing it is an edit to this file rather than a
   search across the codebase.

   Nothing outside this module may hardcode the name — not page titles, not
   metadata, not database identifiers, not storage paths, not URLs.
   ========================================================================= */

export const brand = {
  /** Display name, as it appears to a reader. */
  name: "Loose Nickels",
  /** One line. Used in metadata and on public pages. */
  tagline: "One photograph a day, becoming a life over time.",
  /** Attribution on public profiles. Kept subordinate to the photography. */
  attribution: "Made with Loose Nickels",
} as const;
