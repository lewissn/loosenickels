import type { Collection } from "@/lib/archive/schema";

/* =========================================================================
   Collections

   Curated rather than folder-like. A collection is an editorial act: it has
   a note, an opening date, and occasionally a keystone record that stands
   for it. Entries may belong to several, or to none.

   A collection is never closed merely because nothing has been added to it.
   ========================================================================= */

export const collections: Collection[] = [
  {
    slug: "things-found-in-woods",
    title: "Things Found in Woods",
    note: "The woods return a narrow range of objects with great consistency. This collection exists to test whether that range is as narrow as it appears.",
    dept: "OB",
    keystone: "LN-OB-0001",
    opened: "2026-10-04",
  },
  {
    slug: "excellent-light",
    title: "Excellent Light",
    note: "Records made under conditions that could not have been arranged and did not last. Admission is by the light alone; the subject is immaterial.",
    dept: "PH",
    keystone: "LN-PH-0004",
    opened: "2026-01-28",
  },
  {
    slug: "water",
    title: "Water",
    note: "Standing, falling, withdrawing and frozen. The archive did not intend this to become the largest collection and has stopped resisting.",
    dept: "PL",
    keystone: "LN-PL-0001",
    opened: "2026-03-22",
  },
  {
    slug: "machines",
    title: "Machines",
    note: "Objects with moving parts, and the sounds those parts make while slowing down.",
    dept: "AU",
    keystone: "LN-AU-0002",
    opened: "2026-06-19",
  },
  {
    slug: "buildings-i-would-live-in",
    title: "Buildings I Would Live In",
    note: "Assessed on the single criterion. Structural condition, ownership, legality of access and distance from anywhere have all been disregarded.",
    dept: "PL",
    keystone: "LN-PL-0003",
    opened: "2026-02-08",
  },
  {
    slug: "unreasonably-good-trees",
    title: "Unreasonably Good Trees",
    note: "Trees that are better than they need to be. The standard is not defined and is applied consistently.",
    dept: "FN",
    keystone: "LN-DR-0001",
    opened: "2026-04-11",
  },
  {
    slug: "evidence-of-people",
    title: "Evidence of People",
    note: "Marks left by somebody who was not thinking about leaving a mark. Wear, repair, boundaries, and work done to a standard nobody was going to check.",
    dept: "OB",
    keystone: "LN-OB-0002",
    opened: "2026-06-19",
  },
  {
    slug: "things-that-will-outlive-me",
    title: "Things That Will Outlive Me",
    note: "Opened on the day the corresponding thought was recorded, without prior intention. Most of the archive is eligible.",
    dept: "OB",
    keystone: "LN-TH-0003",
    opened: "2026-10-19",
  },
  {
    slug: "unidentified",
    title: "Unidentified",
    note: "Records the archive has failed to classify. Membership is intended to be temporary and has not been, in any case so far.",
    dept: "OB",
    keystone: "LN-OB-0004",
    opened: "2026-05-02",
  },
  {
    slug: "roads-worth-taking",
    title: "Roads Worth Taking",
    note: "Including at least one that goes nowhere, one that is under water for most of the year, and one that is only a road by a definition the archive has had to construct.",
    dept: "PL",
    keystone: "LN-PL-0002",
    opened: "2026-04-17",
  },
  {
    slug: "objects-of-uncertain-purpose",
    title: "Objects of Uncertain Purpose",
    note: "A subset of the Unidentified, distinguished by the fact that these objects clearly had a purpose and it is the archive that is at fault.",
    dept: "OB",
    keystone: "LN-OB-0004",
    opened: "2026-05-02",
  },
];
