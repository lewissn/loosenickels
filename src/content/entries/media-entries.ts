import type { EntryInput } from "@/lib/archive/schema";

/* Departments of Photographs, Sounds and Experiments.

   None of these records carry media files yet. That is a stated condition
   rather than a gap: an un-digitised record draws its generative plate and
   is presented as awaiting digitisation, which is what it is. The moment a
   real file is attached, the plate steps aside. */

export const photographs: EntryInput[] = [
  {
    id: "LN-PH-0001",
    dept: "PH",
    slug: "excellent-light-briefly",
    title: "Excellent light, briefly",
    summary:
      "Approximately ninety seconds, at the far end of a day that had given no indication it was going to do this.",
    date: "2026-01-28",
    place: {
      name: "Shingle spit, Orford Ness",
      region: "Suffolk",
      country: "United Kingdom",
      coordinates: { lat: 52.0902, lon: 1.5568, precision: 150, elevation: 2 },
    },
    weather: "Overcast all day, clearing at the horizon at 16:31",
    collections: ["excellent-light", "water"],
    tags: ["light", "coast", "winter"],
    significance: "considerable",
    body: [
      {
        type: "p",
        text: "The cloud had been unbroken since morning and stayed unbroken. What happened was that it ended about two degrees above the sea, and for a minute and a half the sun came underneath it and lit the underside of the entire sky from below.",
      },
      {
        type: "p",
        text: "Everything on the shingle acquired a shadow four or five times its own length. The shadows were the colour of the sea and the ground between them was the colour of an apricot, and both of these statements are accurate and neither is useful.",
      },
      {
        type: "note",
        text: "Eleven exposures. Two are worth keeping. This is a good ratio for the circumstances.",
      },
    ],
    related: ["LN-PL-0002", "LN-OB-0003"],
  },

  {
    id: "LN-PH-0002",
    dept: "PH",
    slug: "six-windows",
    title: "Six windows",
    summary:
      "A wall with six windows, of which two are real. Photographed straight on, because it deserved to be.",
    date: "2026-06-02",
    place: {
      name: "Mill elevation, Hebden Bridge",
      region: "West Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.7395, lon: -2.0089, precision: 30 },
    },
    collections: ["evidence-of-people", "buildings-i-would-live-in"],
    tags: ["architecture", "windows", "brick"],
    significance: "undetermined",
    body: [
      {
        type: "p",
        text: "Four of the six are blind: built as openings, bricked flush at some later date, and then — this is the part worth the photograph — painted to look like windows, including the glazing bars and a suggestion of reflection.",
      },
      {
        type: "p",
        text: "Somebody was paid to do that. Somebody stood on a ladder in the north of England and painted a picture of a window onto a wall, at a height where it would only ever be seen from an angle, and did a competent job of it.",
      },
      {
        type: "p",
        text: "The paint is failing on two of them and the brick is coming through, which means there is now a window painted onto a wall in the process of turning back into a wall.",
      },
    ],
    related: ["LN-DR-0003"],
  },

  {
    id: "LN-PH-0003",
    dept: "PH",
    slug: "the-wood-in-cloud",
    title: "The wood in cloud",
    summary:
      "Visibility approximately twelve metres. Everything beyond it a suggestion, everything within it extremely specific.",
    date: "2026-04-11",
    place: {
      name: "Wistman's Wood",
      region: "Devon",
      country: "United Kingdom",
      coordinates: { lat: 50.5789, lon: -3.9642, precision: 90, elevation: 410 },
    },
    weather: "Hill fog, saturated, 8 °C, no wind whatsoever",
    collections: ["things-found-in-woods", "unreasonably-good-trees"],
    tags: ["fog", "oak", "moss", "granite"],
    significance: "considerable",
    body: [
      {
        type: "lede",
        text: "A wood of about four hundred stunted oaks growing out of a boulder field, in which every available surface is carrying something else that is also alive.",
      },
      {
        type: "p",
        text: "In fog the wood stops having a boundary. There is no far side and no sky, and the effect is that the twelve metres you can see become the entire world and are lit evenly from every direction at once, which is a lighting condition photographers spend money trying to reproduce.",
      },
      {
        type: "p",
        text: "The oaks are perhaps two hundred years old and rarely exceed five metres. The moss on the boulders is deep enough to put a hand into. The archive did so, and then did not photograph anything for some minutes.",
      },
    ],
    related: ["LN-FN-0004", "LN-AU-0002"],
  },
];

export const sounds: EntryInput[] = [
  {
    id: "LN-AU-0001",
    dept: "AU",
    slug: "rain-on-a-polytunnel",
    title: "Rain on a polytunnel",
    summary:
      "Six minutes and twelve seconds. The best rain surface in common use and nobody chose it for that.",
    date: "2026-09-12",
    place: {
      name: "Allotment, north of the town",
      region: "West Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.7461, lon: -2.0186, precision: 400 },
    },
    weather: "Heavy shower, passing, 12 °C",
    collections: ["water"],
    tags: ["rain", "recording", "polythene"],
    significance: "personal",
    body: [
      {
        type: "p",
        text: "Polythene under tension is a drum head about nine metres long, and rain plays it as one. Each drop is individually audible near the recorder and the rest arrives as a wash, so the whole thing has a foreground and a background without anybody arranging it.",
      },
      {
        type: "p",
        text: "At 04:15 the shower intensifies and the individual drops stop being distinguishable. At 05:38 it thins again and they come back. This is the only event in the recording and it is enough.",
      },
      {
        type: "measurements",
        rows: [
          ["Duration", "6 min 12 s"],
          ["Recorder", "Handheld, XY pair"],
          ["Position", "Approx. 1.2 m below the apex, inside"],
          ["Interventions", "None"],
        ],
      },
    ],
    related: ["LN-FN-0001"],
  },

  {
    id: "LN-AU-0002",
    dept: "AU",
    slug: "lathe-running-down",
    title: "Lathe, running down",
    summary:
      "Forty-one seconds from cut-off to stop, most of it below the range in which a note has a name.",
    date: "2026-06-19",
    place: {
      name: "Workshop",
      region: "West Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.7418, lon: -2.0128, precision: 1200 },
    },
    collections: ["machines", "evidence-of-people"],
    tags: ["machinery", "recording", "workshop"],
    significance: "undetermined",
    body: [
      {
        type: "p",
        text: "A 1948 machine with a considerable amount of rotating mass and no brake. When the power goes off it takes forty-one seconds to stop, and it does not do so smoothly: there are two points at which the pitch drops noticeably faster, which are presumably bearings, and one point near the end where it very briefly speeds up, which is not.",
      },
      {
        type: "note",
        text: "The archive has been unable to account for the acceleration and has stopped trying to. It happens every time.",
      },
    ],
    related: ["LN-OB-0002", "LN-OB-0004"],
    remark: "Unexplained. Reproducible.",
  },
];

export const experiments: EntryInput[] = [
  {
    id: "LN-XP-0001",
    dept: "XP",
    slug: "the-survey-plot",
    title: "The survey plot",
    summary:
      "Every placed record in the archive, drawn to a graticule, with no basemap of any kind.",
    date: "2026-11-02",
    collections: ["roads-worth-taking"],
    tags: ["interactive", "cartography", "geography"],
    significance: "undetermined",
    body: [
      {
        type: "lede",
        text: "A map with nothing on it except the things the archive has been to.",
      },
      {
        type: "p",
        text: "There is no coastline, no relief, no road network and no place name that the archive did not itself record. What remains is a scatter of points and a graticule, which turns out to be enough: the cluster in the Pennines is obvious, the outliers are obvious, and the very large empty area to the west is the Irish Sea and requires no label to say so.",
      },
      {
        type: "p",
        text: "Removing the basemap was originally an economy. It has been retained because the result is more honest — a map of where the archive has been, rather than a map of the country with a few pins in it.",
      },
    ],
    related: ["LN-TH-0002", "LN-DR-0002"],
  },
];
