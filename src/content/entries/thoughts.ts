import type { EntryInput } from "@/lib/archive/schema";

/* Department of Thoughts — fragments too short to be essays and too settled
   to be questions.

   These records carry almost no metadata by design. The typography is the
   entire presentation. */

export const thoughts: EntryInput[] = [
  {
    id: "LN-TH-0001",
    dept: "TH",
    slug: "somewhere-intended-for-reading",
    title: "A house becomes considerably nicer when there is somewhere specifically intended for reading.",
    date: "2026-02-14",
    collections: ["buildings-i-would-live-in"],
    tags: ["domestic", "rooms"],
    significance: "personal",
    body: [
      {
        type: "p",
        text: "Not a study. Not a library. A chair, positioned for the light, with a surface at the correct height beside it, and nothing else asked of the corner it occupies.",
      },
      {
        type: "p",
        text: "Houses that have one are recognisable on entry. Houses that do not have one can be very expensive and still feel like somewhere you are passing through.",
      },
    ],
    related: ["LN-PL-0003"],
  },

  {
    id: "LN-TH-0002",
    dept: "TH",
    slug: "the-map-is-not-finished",
    title: "Every map is an argument about what is worth drawing.",
    date: "2026-05-29",
    collections: ["roads-worth-taking"],
    tags: ["maps", "cartography"],
    significance: "undetermined",
    body: [
      {
        type: "p",
        text: "A footpath appears; a desire line does not. A church is named; the building beside it is a grey rectangle. The ruin at the head of the cwm is labelled sheepfold because there is a symbol for sheepfold and no symbol for the thing it actually is.",
      },
      {
        type: "p",
        text: "None of this is a failing. A map that recorded everything would be the size of the ground and would be of no use to anybody. But it is worth remembering, on the hill, that the disagreement between the map and the view is not always the view being wrong.",
      },
    ],
    related: ["LN-PL-0003", "LN-DR-0002"],
  },

  {
    id: "LN-TH-0003",
    dept: "TH",
    slug: "things-that-will-outlive-me",
    title: "Almost everything I own will still exist when I do not.",
    date: "2026-10-19",
    collections: ["things-that-will-outlive-me"],
    tags: ["objects", "time"],
    significance: "considerable",
    body: [
      {
        type: "p",
        text: "The stone, certainly. The bevel, which has already outlived at least one owner and shows no sign of taking the hint. The staple. The glass, which has been in the process of outliving people for forty years already and has barely started.",
      },
      {
        type: "p",
        text: "This is normally raised as a melancholy observation and the archive does not experience it as one. The alternative — owning only things that fail before you do — sounds considerably worse.",
      },
      {
        type: "note",
        text: "The collection of that name was opened on the day this was written and was not planned in advance.",
      },
    ],
    related: ["LN-OB-0001", "LN-OB-0002", "LN-OB-0005"],
  },

  {
    id: "LN-TH-0004",
    dept: "TH",
    slug: "the-second-visit",
    title: "Nowhere is properly seen on the first visit.",
    date: "2026-03-30",
    tags: ["places", "attention"],
    collections: ["roads-worth-taking"],
    significance: "personal",
    body: [
      {
        type: "p",
        text: "The first visit is spent establishing where things are. Only on the second is there any capacity left over for noticing what they are like.",
      },
      {
        type: "p",
        text: "This is an argument for going back to the same six places indefinitely rather than to sixty places once, and the archive is aware that it is a convenient argument for somebody who does not travel very far.",
      },
    ],
  },
];
