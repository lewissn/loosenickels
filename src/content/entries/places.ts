import type { EntryInput } from "@/lib/archive/schema";

/* Department of Places — locations recorded against their coordinates. */

export const places: EntryInput[] = [
  {
    id: "LN-PL-0001",
    dept: "PL",
    slug: "the-reservoir-at-langsett",
    title: "The reservoir at Langsett",
    summary:
      "Drawn down in late summer, at which point the drowned road becomes available again for about six weeks.",
    date: "2026-08-30",
    place: {
      name: "Langsett Reservoir",
      region: "South Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.4884, lon: -1.6946, precision: 50, elevation: 250 },
    },
    weather: "Clear, light north-westerly, 18 °C",
    collections: ["water", "roads-worth-taking", "evidence-of-people"],
    tags: ["reservoir", "drawdown", "moorland"],
    significance: "considerable",
    body: [
      {
        type: "lede",
        text: "For most of the year it is a reservoir. For a few weeks in a dry year it is a valley with a reservoir in the bottom of it, and a road going down into the water and out the other side.",
      },
      {
        type: "p",
        text: "The road served North America Farm, which is a real name and not a joke, and which was demolished along with everything else in the valley when the water came in 1904. In August of a dry year the drawdown exposes about three hundred metres of it: sett-laid, cambered, with the kerbs still in place, running out of the trees and straight into the water.",
      },
      {
        type: "p",
        text: "It is possible to walk on it. It is not possible to walk far. The surface is covered in a fine grey silt that holds a footprint perfectly and then loses it again the moment the level comes up.",
      },
      {
        type: "note",
        text: "The archive has visited in four consecutive years. The road was available in two of them.",
      },
      {
        type: "measurements",
        rows: [
          ["Capacity", "1,406 megalitres"],
          ["Impounded", "1904"],
          ["Exposed road, 2026", "approx. 310 m"],
          ["Exposed road, 2025", "none"],
          ["Depth over road at full", "approx. 9 m"],
        ],
      },
    ],
    related: ["LN-OB-0001", "LN-FN-0003"],
  },

  {
    id: "LN-PL-0002",
    dept: "PL",
    slug: "a-road-with-no-apparent-destination",
    title: "A road with no apparent destination",
    summary:
      "Metalled, kerbed, gated at both ends, 1.4 km long, and connecting nothing to nothing.",
    date: "2026-04-17",
    place: {
      name: "Orford Ness",
      region: "Suffolk",
      country: "United Kingdom",
      coordinates: { lat: 52.0846, lon: 1.5432, precision: 200, elevation: 3 },
    },
    weather: "Haze, no wind, 11 °C",
    collections: ["roads-worth-taking", "evidence-of-people", "unidentified"],
    tags: ["road", "military", "shingle"],
    significance: "contested",
    body: [
      {
        type: "p",
        text: "It was built to a standard well beyond what the traffic could have required, which is the usual sign. Both ends now stop at a gate, and beyond each gate the shingle simply continues.",
      },
      {
        type: "p",
        text: "The Ness was a weapons research establishment for most of the twentieth century and a great deal of what is on it was built to move something heavy from one building to another building, both of which have since been taken down. The road is what is left of a relationship between two absent things.",
      },
      {
        type: "quote",
        text: "The buildings are being allowed to fall down. This is the policy and not a failure of the policy.",
        attribution: "Site notice, paraphrased",
      },
    ],
    related: ["LN-OB-0003", "LN-DR-0002"],
  },

  {
    id: "LN-PL-0003",
    dept: "PL",
    slug: "ruin-unnamed-on-the-1-25-000",
    title: "Ruin, unnamed on the 1:25 000",
    summary:
      "Four walls to shoulder height, a hearth, an ash tree growing where the door was.",
    date: "2026-02-08",
    place: {
      name: "Head of the cwm, above Llyn Idwal",
      region: "Gwynedd",
      country: "United Kingdom",
      coordinates: { lat: 53.1128, lon: -4.0294, precision: 40, elevation: 512 },
    },
    weather: "Cloud on the tops, drizzle, 4 °C",
    collections: ["buildings-i-would-live-in", "things-found-in-woods"],
    tags: ["ruin", "hafod", "stone"],
    significance: "personal",
    body: [
      {
        type: "lede",
        text: "The map marks it, as it marks all such things, with the word sheepfold, which it is not.",
      },
      {
        type: "p",
        text: "The walls are drystone, roughly a metre thick, with through-stones still in place. There is a lintelled opening on the south-east side and a hearth in the north wall with the back stones fire-reddened to a depth of about thirty millimetres. Sheepfolds do not have hearths.",
      },
      {
        type: "p",
        text: "It is almost certainly a hafod: summer accommodation, occupied for perhaps ten weeks a year while stock were on the high grazing, abandoned by the middle of the nineteenth century when the practice stopped being worth the walk.",
      },
      {
        type: "p",
        text: "The ash is about forty years old and is directly in the doorway, which is a thing ash trees seem to enjoy doing.",
      },
      {
        type: "note",
        text: "Coordinates are recorded to a precision the archive considers appropriate rather than to the precision available.",
      },
    ],
    footnotes: [
      {
        marker: "1",
        text: "Ordnance Survey uses a small number of generic labels for unidentified rural structures. This is sensible cartography and occasionally poor history.",
      },
    ],
    related: ["LN-PL-0004", "LN-OB-0005"],
  },

  {
    id: "LN-PL-0004",
    dept: "PL",
    slug: "the-darkest-place-so-far",
    title: "The darkest place so far",
    summary:
      "Bortle 2. Measured, not estimated. The Milky Way casts a shadow if you are patient and the moon is elsewhere.",
    date: "2026-11-21",
    place: {
      name: "Forest Drive, above Kielder",
      region: "Northumberland",
      country: "United Kingdom",
      coordinates: { lat: 55.2216, lon: -2.5443, precision: 300, elevation: 371 },
    },
    weather: "Clear, hard frost, −4 °C",
    collections: ["excellent-light", "things-found-in-woods"],
    tags: ["dark-sky", "night", "forest"],
    significance: "considerable",
    body: [
      {
        type: "p",
        text: "Sky brightness measured at 21.84 magnitudes per square arcsecond, at 23:40, with the moon down and no cloud. This is close to the practical limit for the United Kingdom and is a very long way from a street light.",
      },
      {
        type: "p",
        text: "It takes about twenty-five minutes for the eye to become useful and about forty for it to become good. Nothing much can be done to hurry this and there is no reason to.",
      },
      {
        type: "measurements",
        rows: [
          ["Sky brightness", "21.84 mag arcsec⁻²"],
          ["Bortle class", "2"],
          ["Air temperature", "−4 °C"],
          ["Nearest permanent light", "approx. 6.1 km"],
          ["Time to full adaptation", "approx. 40 min"],
        ],
      },
      {
        type: "note",
        text: "This record will be superseded the moment somewhere darker is visited, and the archive is actively hoping to lose it.",
      },
    ],
    related: ["LN-DR-0001", "LN-AU-0001"],
  },
];
