import "server-only";

/* =========================================================================
   Turning coordinates into a name.

   The archive stores where a photograph was taken to seven decimal places
   and shows, at most, "Fort William". That gap is the point: the precision
   is kept because it cannot be recovered later, and the name is what a
   person actually remembers a day by.

   Four fields rather than one, because they are the rungs of the disclosure
   ladder. A viewer entitled only to `region` is shown Scotland; one entitled
   to `locality` is shown Fort William. Resolving all of them once, here, is
   what lets `discloseLocation` choose between them at read time without
   another lookup.

   BigDataCloud's free reverse geocoder, which needs no key. Nominatim gives
   the same answer and its usage policy asks people not to do this
   automatically, so it is not asked.
   ========================================================================= */

export interface Placed {
  /** The narrowest name — the town or city. Shown at `locality` and above. */
  placeName?: string;
  locality?: string;
  /** The broader containing area, for when only a region may be shown. */
  region?: string;
  country?: string;
}

export async function placeAt(
  latitude: number,
  longitude: number,
): Promise<Placed | undefined> {
  const url =
    `https://api-bdc.net/data/reverse-geocode-client` +
    `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
    `&localityLanguage=en`;

  let body: {
    locality?: string;
    city?: string;
    principalSubdivision?: string;
    countryName?: string;
  };

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return undefined;
    body = await response.json();
  } catch {
    /* The photograph is already safe and the day simply has no place name.
       Nothing here may fail a recording. */
    return undefined;
  }

  const locality = body.locality || body.city || undefined;
  const region = body.principalSubdivision || undefined;

  /* Trimmed, because the full official form is a sentence rather than a
     place: "United Kingdom of Great Britain and Northern Ireland" under a
     photograph is not what anybody calls anywhere. */
  const country = body.countryName?.replace(
    /^United Kingdom of Great Britain and Northern Ireland$/,
    "United Kingdom",
  );

  const placed: Placed = {
    placeName: locality,
    locality,
    region,
    country,
  };

  return Object.values(placed).some((v) => v !== undefined) ? placed : undefined;
}
