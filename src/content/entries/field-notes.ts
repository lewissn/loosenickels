import type { EntryInput } from "@/lib/archive/schema";

/* Department of Field Notes — observations made at a particular time,
   in a particular weather. */

export const fieldNotes: EntryInput[] = [
  {
    id: "LN-FN-0001",
    dept: "FN",
    slug: "rain-arriving-from-the-west",
    title: "Rain arriving from the west, 14:20",
    summary:
      "Watched for eleven minutes from a dry position, which is the only correct way to watch it.",
    date: "2026-09-12",
    place: {
      name: "Blackden Edge",
      region: "Derbyshire",
      country: "United Kingdom",
      coordinates: { lat: 53.3806, lon: -1.8422, precision: 80, elevation: 545 },
    },
    weather: "Squally, veering south-westerly, 12 °C",
    collections: ["water", "excellent-light"],
    tags: ["weather", "moorland", "rain"],
    significance: "personal",
    body: [
      {
        type: "lede",
        text: "From a high enough position you do not experience weather so much as receive advance notice of it.",
      },
      {
        type: "p",
        text: "The front was visible for about eleven minutes before it arrived: a grey wall standing on the far side of the valley with the light going out underneath it in a line that moved across the ground at roughly the speed of a car. Everything it passed over stopped being a colour and became a shade.",
      },
      {
        type: "p",
        text: "There is a particular sound just before, where the wind changes its mind about direction and the grass all turns over at once. Then there is about four seconds of nothing. Then it is raining and has been raining for some time.",
      },
      {
        type: "measurements",
        rows: [
          ["First sighting", "14:09"],
          ["Arrival", "14:20"],
          ["Estimated frontal speed", "approx. 42 km h⁻¹"],
          ["Duration of the pause", "approx. 4 s"],
          ["Shelter", "Adequate"],
        ],
      },
    ],
    related: ["LN-PL-0001", "LN-AU-0001"],
  },

  {
    id: "LN-FN-0002",
    dept: "FN",
    slug: "frost-on-the-inside-of-the-window",
    title: "Frost on the inside of the window",
    summary:
      "Fern-form, on the north light only, and gone by nine. Recorded because it is becoming rare.",
    date: "2026-12-04",
    place: {
      name: "The archive, north elevation",
      region: "West Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.7418, lon: -2.0128, precision: 1200 },
    },
    weather: "Clear overnight, −6 °C, no wind",
    collections: ["water", "excellent-light"],
    tags: ["frost", "ice", "winter", "domestic"],
    significance: "personal",
    body: [
      {
        type: "p",
        text: "The single-glazed north light is the only window in the building that still does this, and it does it perhaps three mornings a year now. The other windows were replaced and have been correspondingly uninteresting ever since.",
      },
      {
        type: "p",
        text: "Fern frost forms when water vapour goes straight to ice on a surface below freezing, and the branching is directed by scratches and dust and whatever else is on the glass. The pattern is therefore a record of the window rather than of the weather. The same window makes approximately the same ferns each time, which nobody warns you about and which is quietly remarkable.",
      },
      {
        type: "note",
        text: "Photographed at 07:41 against the sky, at 08:02 against a dark cloth, and at 08:15 unsuccessfully. Gone by 09:00.",
      },
    ],
    footnotes: [
      {
        marker: "1",
        text: "The archive accepts that improved glazing is, on balance, a good thing, and records its position under protest.",
      },
    ],
    related: ["LN-TH-0002", "LN-PH-0001"],
  },

  {
    id: "LN-FN-0003",
    dept: "FN",
    slug: "low-water",
    title: "Low water",
    summary:
      "Third dry August in four years. The archive is trying not to draw a conclusion from this and is not managing it.",
    date: "2026-08-30",
    place: {
      name: "Langsett Reservoir, north shore",
      region: "South Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.4901, lon: -1.6913, precision: 60, elevation: 244 },
    },
    weather: "Clear, 24 °C, no cloud in any direction",
    collections: ["water", "evidence-of-people"],
    tags: ["drought", "reservoir", "drawdown"],
    significance: "contested",
    body: [
      {
        type: "p",
        text: "The tide line — which is not a tide line, but there is no better word for it — is about four metres below the tree line, and between the two there is a band of pale silt, cracked into plates roughly the size of a hand.",
      },
      {
        type: "p",
        text: "Things in the exposed ground, in order of appearance: a gatepost. A quantity of barbed wire. Two horseshoes. The road. A traffic cone, which had clearly been thrown in and was not of historical interest but has been noted anyway in the interest of an honest record.",
      },
      {
        type: "note",
        text: "The exposure is entertaining and the reason for the exposure is not. Both are true at once and the archive has no plan for reconciling them.",
      },
    ],
    related: ["LN-PL-0001"],
  },

  {
    id: "LN-FN-0004",
    dept: "FN",
    slug: "the-ash-is-going",
    title: "The ash is going",
    summary:
      "Sixty-one trees counted along one lane. Nine still holding a full crown. Recorded now because it will not be possible later.",
    date: "2026-07-06",
    place: {
      name: "The lane to Wistman's Wood",
      region: "Devon",
      country: "United Kingdom",
      coordinates: { lat: 50.5776, lon: -3.9631, precision: 500, elevation: 380 },
    },
    weather: "Warm, close, 21 °C",
    collections: ["unreasonably-good-trees", "things-that-will-outlive-me"],
    tags: ["ash", "dieback", "trees", "survey"],
    significance: "considerable",
    body: [
      {
        type: "lede",
        text: "It is a strange thing to make a record whose only certain use is to show, later, what was there.",
      },
      {
        type: "p",
        text: "Counted on foot along 2.1 km of lane, both sides, every ash of trunk diameter greater than about 150 mm. Sixty-one trees. Nine with a crown the archive would describe as full. Twenty-two with visible dieback in the upper third. Thirty with substantial crown loss or already standing dead.",
      },
      {
        type: "measurements",
        rows: [
          ["Transect length", "2.1 km"],
          ["Ash counted", "61"],
          ["Full crown", "9"],
          ["Partial dieback", "22"],
          ["Severe or dead", "30"],
          ["Survey time", "1 h 50 min"],
        ],
      },
      {
        type: "p",
        text: "A small number of trees appear to be resisting. Whether this is tolerance or luck cannot be determined from a lane in Devon on a Tuesday, and the archive has recorded their positions in case it matters.",
      },
      {
        type: "note",
        text: "To be repeated annually while there is anything to repeat it on.",
      },
    ],
    related: ["LN-TH-0003", "LN-DR-0001"],
    remark: "Open survey. Second count due July 2027.",
  },
];
