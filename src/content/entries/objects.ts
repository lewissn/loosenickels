import type { EntryInput } from "@/lib/archive/schema";

/* Department of Objects — physical material retained without a stated reason. */

export const objects: EntryInput[] = [
  {
    id: "LN-OB-0001",
    dept: "OB",
    slug: "granite-presumed",
    title: "Granite, presumed",
    summary:
      "Collected beside a forestry road approximately eleven kilometres north of somewhere worth mentioning.",
    date: "2026-10-04",
    acquired: "2026-10-04",
    place: {
      name: "Forestry road, north of Langsett",
      region: "South Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.5241, lon: -1.6802, precision: 400, elevation: 341 },
    },
    material: "Granite, presumed",
    dimensions: "71 × 54 × 38 mm",
    mass: "184 g",
    weather: "Overcast, still, 9 °C",
    collections: ["things-found-in-woods", "things-that-will-outlive-me"],
    tags: ["stone", "forestry", "roadside"],
    significance: "undetermined",
    body: [
      {
        type: "lede",
        text: "It was on the verge where the gravel gives out, half under the leaf litter, and it was the only thing there that was not brown.",
      },
      {
        type: "p",
        text: "The specimen is coarse-grained and pale, with visible feldspar and a quantity of dark mineral that has not been identified and will not be. One face is flat enough to suggest it was split rather than worn. The remaining faces are rounded in the way of stones that have been moved by water at some point, though not recently and not, it seems likely, here.",
      },
      {
        type: "p",
        text: "Granite does not occur naturally within forty kilometres of the collection point. The most probable explanation is that it arrived as roadstone, in a lorry, from a quarry, in the ordinary course of maintaining a track that leads to a plantation of Sitka spruce. This explanation is almost certainly correct and has been recorded here in the interest of completeness.",
      },
      {
        type: "note",
        text: "The archive notes that it carried the specimen for the remaining six kilometres of the walk, which was further than it had intended to carry anything.",
      },
      {
        type: "measurements",
        rows: [
          ["Mass", "184 g"],
          ["Greatest dimension", "71 mm"],
          ["Density, approx.", "2.7 g cm⁻³"],
          ["Distance carried", "6.2 km"],
          ["Distance from probable origin", "Undetermined"],
        ],
      },
    ],
    footnotes: [
      {
        marker: "1",
        text: "Identification is by appearance only. No thin section has been prepared and none is planned.",
      },
    ],
    related: ["LN-PL-0001", "LN-TH-0003"],
    remark: "Retained.",
  },

  {
    id: "LN-OB-0002",
    dept: "OB",
    slug: "sliding-bevel-rosewood-and-brass",
    title: "Sliding bevel, rosewood and brass",
    summary:
      "A tool worn smooth in one place by a thumb that was not the archive's.",
    date: "2026-06-19",
    acquired: "2026-06-19",
    place: {
      name: "House clearance, Hebden Bridge",
      region: "West Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.7422, lon: -2.0141, precision: 900 },
    },
    material: "Rosewood stock, brass fittings, steel blade",
    dimensions: "Stock 230 mm; blade 250 mm",
    source: "Acquired for £4 from a table at the front of a house clearance.",
    collections: ["evidence-of-people", "things-that-will-outlive-me"],
    tags: ["tool", "woodwork", "wear"],
    significance: "personal",
    body: [
      {
        type: "p",
        text: "The blade still moves. The wing nut still holds. Nothing about the tool requires attention, which is more than can be said for most things of its age.",
      },
      {
        type: "p",
        text: "On the upper edge of the stock, about a third of the way along, the rosewood is worn perhaps a millimetre below the surrounding surface, polished, and slightly darker. It is exactly where a right thumb would sit while the left hand set the angle. Somebody did this several thousand times.",
      },
      {
        type: "note",
        text: "The archive has been unable to establish who, and has not tried especially hard, on the grounds that the wear is the more interesting record.",
      },
      {
        type: "p",
        text: "There are no maker's marks. There is a set of initials scratched into the underside of the stock, in a hand that was not concerned about being neat, reading either J.W.H. or J.W.B.",
      },
    ],
    related: ["LN-TH-0003", "LN-OB-0004"],
  },

  {
    id: "LN-OB-0003",
    dept: "OB",
    slug: "bottle-glass-sea-worn",
    title: "Bottle glass, sea-worn",
    summary:
      "Green, frosted, edges entirely gone. Approximately forty years in the water, at a guess nobody has checked.",
    date: "2026-03-22",
    acquired: "2026-03-22",
    place: {
      name: "Shingle below the cliff, Dunwich",
      region: "Suffolk",
      country: "United Kingdom",
      coordinates: { lat: 52.2771, lon: 1.6294, precision: 120, elevation: 2 },
    },
    material: "Soda-lime glass",
    dimensions: "28 × 22 × 6 mm",
    mass: "6 g",
    weather: "Bright, hard easterly, 6 °C",
    collections: ["water", "excellent-light"],
    tags: ["glass", "coast", "erosion"],
    significance: "negligible",
    body: [
      {
        type: "p",
        text: "The coast here retreats by about a metre a year, and has been doing so for long enough that a town, eight churches and a harbour are now some distance offshore and below. Against that, a fragment of a bottle is not much of a loss.",
      },
      {
        type: "p",
        text: "It is nonetheless the correct green. Held up, it is the colour of the sea about two hundred metres out on a day with no cloud, which is a colour the sea is not often willing to be.",
      },
    ],
    related: ["LN-PL-0003", "LN-PH-0001"],
  },

  {
    id: "LN-OB-0004",
    dept: "OB",
    slug: "object-of-uncertain-purpose",
    title: "Object of uncertain purpose",
    summary:
      "Cast iron. Two arms, one threaded boss, no obvious function. Enquiries continue at a leisurely pace.",
    date: "2026-05-02",
    acquired: "2026-05-02",
    place: {
      name: "Beneath a hedge, Blackden Edge approach",
      region: "Derbyshire",
      country: "United Kingdom",
      coordinates: { lat: 53.3812, lon: -1.8397, precision: 60, elevation: 402 },
    },
    material: "Cast iron, heavily corroded",
    dimensions: "148 × 96 × 31 mm",
    mass: "612 g",
    collections: ["objects-of-uncertain-purpose", "unidentified"],
    tags: ["iron", "agricultural", "unidentified"],
    significance: "contested",
    body: [
      {
        type: "p",
        text: "The threaded boss takes a coarse imperial thread of about half an inch. The two arms are of unequal length and meet at an angle that is close to, but is not, ninety degrees. There is no casting mark.",
      },
      {
        type: "list",
        items: [
          "Part of a gate latch — rejected; the geometry does not close.",
          "A bracket from a horse-drawn implement — plausible, unconfirmed.",
          "A component of a stove — plausible, unconfirmed.",
          "Deliberately made to be unidentifiable — not seriously entertained.",
        ],
      },
      {
        type: "note",
        text: "Two visitors to the archive have offered confident and mutually incompatible identifications. Both have been recorded. Neither has been accepted.",
      },
    ],
    related: ["LN-OB-0002"],
    remark: "Classification pending. Indefinitely.",
  },

  {
    id: "LN-OB-0005",
    dept: "OB",
    slug: "fence-staple-withdrawn",
    title: "Fence staple, withdrawn from a post",
    summary:
      "Held a wire for an estimated sixty years, and had grown a considerable amount of post around itself in the process.",
    date: "2026-01-11",
    acquired: "2026-01-11",
    place: {
      name: "Boundary above Rannoch Moor",
      region: "Perth and Kinross",
      country: "United Kingdom",
      coordinates: { lat: 56.6197, lon: -4.6488, precision: 250, elevation: 318 },
    },
    material: "Galvanised steel, galvanising long gone",
    dimensions: "41 mm",
    mass: "9 g",
    weather: "Sleet, westerly, 1 °C",
    collections: ["evidence-of-people", "things-that-will-outlive-me"],
    tags: ["iron", "boundary", "wire"],
    significance: "personal",
    body: [
      {
        type: "p",
        text: "The post had rotted to the point where it could be pulled apart by hand. The staple came away with a plug of wood still gripped in its jaw, the fibres having grown around and then given up.",
      },
      {
        type: "p",
        text: "Somebody stood on this line, in weather that is not materially different from today's weather, and drove this in with a hammer, and then walked on and drove in the next one, and the one after that, for as long as the boundary took.",
      },
    ],
    related: ["LN-PL-0004"],
  },
];
