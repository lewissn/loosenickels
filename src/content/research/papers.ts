import type { ResearchPaper } from "@/lib/archive/schema";

/* =========================================================================
   Department of Unnecessary Research

   Investigations into questions that did not require answering, conducted
   to a standard the questions did not deserve.

   The method sections are real methods. That is the joke, and it only
   works if the methods are actually sound.
   ========================================================================= */

type PaperInput = Omit<
  ResearchPaper,
  "body" | "footnotes" | "collections" | "tags" | "media" | "related" | "method" |
  "significance" | "status" | "visibility"
> &
  Partial<
    Pick<
      ResearchPaper,
      "body" | "footnotes" | "collections" | "tags" | "media" | "related" |
      "method" | "significance" | "status" | "visibility"
    >
  >;

export const papers: PaperInput[] = [
  {
    id: "LN-DR-0001",
    dept: "DR",
    slug: "on-the-silhouette-of-a-single-field-boundary",
    title: "On the silhouette of a single field boundary",
    question:
      "Which tree along this hedgerow has the best silhouette, and can that be established without simply deciding?",
    finding:
      "The seventh tree. Established by a method the archive believes to be sound and would not defend under serious questioning.",
    summary:
      "Nineteen trees, photographed against the same sky within forty minutes, ranked by a criterion agreed before any of them were looked at.",
    date: "2026-12-14",
    acquired: "2026-12-14",
    place: {
      name: "Field boundary, west of the lane",
      region: "West Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.7502, lon: -2.0243, precision: 200, elevation: 268 },
    },
    weather: "Flat overcast — chosen deliberately, 3 °C",
    collections: ["unreasonably-good-trees"],
    tags: ["trees", "method", "winter", "silhouette"],
    significance: "considerable",
    method: [
      "Photograph each tree from due south at 35 mm equivalent, from a distance adjusted so the crown fills the frame height.",
      "Work only under unbroken overcast, so that every subject is lit identically and no tree benefits from having been visited at a better hour.",
      "Reduce each exposure to a one-bit mask. Discard all information except the outline.",
      "Score on three criteria agreed in advance: enclosed sky, branch order, and asymmetry about the vertical.",
      "Do not look at the photographs as photographs until scoring is complete.",
    ],
    body: [
      {
        type: "lede",
        text: "Nineteen ash and two oak stand along four hundred metres of boundary. In winter, with no leaf, they are as close to a controlled comparison as anything the archive is likely to be given.",
      },
      {
        type: "p",
        text: "The difficulty with a question of this kind is not gathering the evidence. It is that the answer is obvious within about four seconds of arriving, and everything that follows is at risk of being an elaborate justification of that first impression. The method was therefore designed principally to make it possible to be wrong.",
      },
      {
        type: "p",
        text: "Enclosed sky is the proportion of the bounding box that is sky fully surrounded by branch. It rewards trees that hold their structure in a way that makes shapes rather than a mass. Branch order counts bifurcations along the longest path from trunk to tip, which rewards trees that resolve rather than trees that are merely large. Asymmetry is measured about the vertical axis, and is included because a perfectly symmetrical tree is a poor silhouette and everybody knows it.",
      },
      {
        type: "measurements",
        rows: [
          ["Subjects", "21 (19 ash, 2 oak)"],
          ["Exposures", "63"],
          ["Elapsed", "38 min"],
          ["Enclosed sky, tree 07", "0.212"],
          ["Enclosed sky, mean", "0.126"],
          ["Branch order, tree 07", "9"],
          ["Branch order, mean", "6.8"],
          ["Asymmetry, tree 07", "0.31"],
        ],
      },
      {
        type: "p",
        text: "Tree seven leads on all three criteria, which is not what was hoped for. A split result would have required adjudication and adjudication would have been more interesting. As it stands the method agrees with the four-second impression, and the archive is left unable to distinguish between having designed a good method and having designed a method that produces the answer it started with.",
      },
      {
        type: "note",
        text: "Tree seven is also one of the nine recorded as holding a full crown in LN–FN–0004. It is unlikely to remain so and the survey should be understood in that light.",
      },
      {
        type: "quote",
        text: "The best silhouette on the boundary belongs to a tree that is probably dying. This was not among the criteria and has not been allowed to affect the score.",
      },
    ],
    footnotes: [
      {
        marker: "1",
        text: "Trees 12 and 18 are the oaks. Both score poorly on enclosed sky and both were included specifically so that the ash would have something to beat.",
      },
      {
        marker: "2",
        text: "The one-bit reduction was performed at a fixed threshold rather than an adaptive one, on the grounds that an adaptive threshold would have been a second, undeclared judgement.",
      },
    ],
    related: ["LN-FN-0004", "LN-PL-0004"],
    remark: "Concluded. To be repeated when tree seven is gone.",
  },

  {
    id: "LN-DR-0002",
    dept: "DR",
    slug: "the-greatest-distance-from-a-road",
    title: "The greatest distance from a road",
    question:
      "How far could a person walk from this exact coordinate without crossing a public road?",
    finding:
      "6.4 km, north-west, ending at a fence. The limit is not the roads. The limit is always a fence.",
    summary:
      "A question that sounds like it has a large answer and does not, in a country of this shape.",
    date: "2026-10-30",
    place: {
      name: "Rannoch Moor, from the eastern approach",
      region: "Perth and Kinross",
      country: "United Kingdom",
      coordinates: { lat: 56.6203, lon: -4.6511, precision: 100, elevation: 320 },
    },
    collections: ["roads-worth-taking"],
    tags: ["distance", "roads", "method", "moor"],
    significance: "contested",
    method: [
      "Take the origin as recorded, to the precision recorded and no better.",
      "Treat as a road anything a car could be driven along without committing an offence. Tracks are not roads. This distinction is doing an enormous amount of work and is the weakest part of the study.",
      "Walk radially on eight bearings at 45° intervals until a road is met or progress becomes impossible.",
      "Record the reason for stopping in every case, because the reason turns out to be the actual finding.",
    ],
    body: [
      {
        type: "lede",
        text: "Britain contains no point more than about seven kilometres from a public road. This is well known and is usually presented as a melancholy fact. It is worth walking one of them to find out whether it feels like one.",
      },
      {
        type: "p",
        text: "It does not, particularly. Six kilometres of open ground with nothing crossing it is a considerable amount of ground, and the knowledge that a road exists somewhere beyond the horizon has very little bearing on the experience of being in the middle of it.",
      },
      {
        type: "p",
        text: "What does have a bearing is the fences. On six of the eight bearings the walk ended at a stock fence rather than at tarmac, at a mean distance of 3.1 km. Only two bearings terminated at an actual road. The question as posed assumes that roads are what divide up the ground, and in this part of Scotland they are not even close to being the main thing that does.",
      },
      {
        type: "measurements",
        rows: [
          ["Bearing 000°", "2.9 km — fence"],
          ["Bearing 045°", "1.8 km — river, impassable"],
          ["Bearing 090°", "2.2 km — road"],
          ["Bearing 135°", "3.4 km — fence"],
          ["Bearing 180°", "4.1 km — fence"],
          ["Bearing 225°", "3.0 km — road"],
          ["Bearing 270°", "2.6 km — fence"],
          ["Bearing 315°", "6.4 km — fence"],
          ["Mean, all bearings", "3.3 km"],
          ["Total walked", "27.2 km"],
        ],
      },
      {
        type: "p",
        text: "The north-westerly bearing is the outlier by a factor of two and is the only one on which the ground genuinely opens. It ends, as recorded, at a fence — a good one, recently maintained, running to the horizon in both directions with no gate visible from the point of contact.",
      },
      {
        type: "note",
        text: "The archive walked 1.2 km along the fence looking for a gate before accepting the result. This was not part of the method and has been recorded anyway.",
      },
    ],
    footnotes: [
      {
        marker: "1",
        text: "Scotland's access legislation makes the fence a physical obstacle rather than a legal one. In England the finding would have been shorter and considerably more irritating.",
      },
    ],
    related: ["LN-PL-0002", "LN-XP-0001", "LN-TH-0002"],
  },

  {
    id: "LN-DR-0003",
    dept: "DR",
    slug: "a-census-of-windows",
    title: "A census of the windows of a mill elevation",
    question: "How many windows does this building have?",
    finding:
      "Between 96 and 214, depending entirely on what is meant by the word window. The archive declines to choose.",
    summary:
      "A question with an obvious answer, asked carefully enough that the obvious answer stops being available.",
    date: "2026-06-02",
    place: {
      name: "Mill, south elevation",
      region: "West Yorkshire",
      country: "United Kingdom",
      coordinates: { lat: 53.7395, lon: -2.0089, precision: 30 },
    },
    collections: ["evidence-of-people", "buildings-i-would-live-in"],
    tags: ["architecture", "counting", "method", "definitions"],
    significance: "contested",
    method: [
      "Photograph the elevation orthogonally in a grid of overlapping frames and rectify.",
      "Count under each of four definitions, declared before counting begins.",
      "Do not reconcile the four counts. Reconciling them would require choosing a definition, which is the question.",
    ],
    body: [
      {
        type: "lede",
        text: "The building has, depending on how the question is meant, ninety-six windows, one hundred and forty-two windows, one hundred and eighty-one windows, or two hundred and fourteen windows.",
      },
      {
        type: "p",
        text: "Definition A counts openings in the wall that currently admit light. Definition B counts openings that were built as openings, including the four that were bricked up and painted to look like windows, and the eleven that were bricked up and not. Definition C counts individual glazed lights, which multiplies the sashes considerably. Definition D counts everything an ordinary person standing in the yard would point at and call a window, established by asking four people and taking the median.",
      },
      {
        type: "measurements",
        rows: [
          ["A — admits light", "96"],
          ["B — built as an opening", "142"],
          ["C — individual glazed lights", "214"],
          ["D — pointed at by a person", "181"],
          ["Painted onto brick", "4"],
          ["Bricked, unpainted", "11"],
          ["Bricked, then painted, now failing", "2"],
        ],
      },
      {
        type: "p",
        text: "The interesting number is D. It is not the highest or the lowest, it does not correspond to any structural fact about the building, and it varied by twenty-two between the four respondents. It is nonetheless the number the building actually has, in the sense that matters to almost everybody who will ever look at it.",
      },
      {
        type: "note",
        text: "Two of the four painted windows are failing and the brick is coming through. Under definition D they are being counted by fewer people each year, which means the building is losing windows without anything being removed from it.",
      },
    ],
    related: ["LN-PH-0002"],
    remark: "Open. Recount scheduled for 2031.",
  },
];
