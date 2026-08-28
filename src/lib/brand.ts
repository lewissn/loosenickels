/* =========================================================================
   Brand

   The product's consumer name is not settled. "Loose Nickels" is a working
   codename and will very likely be replaced.

   Everything user-facing therefore resolves through this file, and nothing
   else in the application spells the name out. A rename is an edit here
   plus a domain change — not an archaeology exercise across two hundred
   files.

   The rule this enforces, stated plainly: the codename may appear in the
   repository name and in this file. Nowhere else. Not in database names,
   API paths, storage keys, cookie names, CSS class names, or copy.
   ========================================================================= */

export const brand = {
  /** Shown wherever the product names itself. */
  name: "Loose Nickels",

  /** Used where the name must be short — tab titles, the iOS app, footers. */
  shortName: "Loose Nickels",

  /**
   * One line. Deliberately plain: the brief's tone rule (§74) is that the
   * product assumes adults, so it describes itself rather than selling.
   */
  tagline: "One photograph a day.",

  /**
   * The longer description, for metadata and the signed-out landing state.
   * Still no exclamation marks, still no promises about magic.
   */
  description:
    "A photograph for each day, kept in order. Over years it becomes a record of a life.",

  /**
   * Canonical origin. The old site answered on two domains that disagreed
   * with each other; this is the one the product actually claims, and every
   * canonical URL, share link and OpenGraph tag derives from it.
   */
  origin: "https://www.loosenickels.com",

  /**
   * The attribution permitted on a public profile (§18). Small, and never
   * allowed to compete with the photography.
   */
  attribution: "Made with",
} as const;

/** Absolute URL for a path, for canonical tags, share links and OG images. */
export function url(path = "/"): string {
  return new URL(path, brand.origin).toString();
}

/** A public profile's address. The scheme is @handle, per §18. */
export function profileUrl(username: string): string {
  return url(`/@${username}`);
}

/** A single day's public address. */
export function dayUrl(username: string, date: string): string {
  return url(`/@${username}/${date}`);
}
