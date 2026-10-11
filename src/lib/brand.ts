/* =========================================================================
   Brand

   The site's name is not settled. "Loose Nickels" is a working
   codename and will very likely be replaced.

   Everything user-facing therefore resolves through this file, and nothing
   else in the application spells the name out. A rename is an edit here
   plus a domain change, not an archaeology exercise.

   The rule this enforces, stated plainly: the codename may appear in the
   repository name and in this file. Nowhere else — not in CSS class names,
   storage keys or copy.
   ========================================================================= */

export const brand = {
  /** Shown wherever the site names itself. */
  name: "Loose Nickels",

  /** One line, plain. The island describes itself rather than selling. */
  tagline: "An island, passing the time.",

  /** The longer description, for metadata. */
  description:
    "A small low-poly island that runs in your browser. Seasons turn, days pass, and the animals go about their lives.",

  /** Canonical origin, for metadata. */
  origin: "https://www.loosenickels.com",

  /** The browser chrome around the island, matched to its night sky. */
  themeColor: "#0b1226",
} as const;
