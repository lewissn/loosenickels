import { z } from "zod";

/* =========================================================================
   LOOSE NICKELS — Archive schema

   This file is the contract. An archive item exists independently of how
   the public website chooses to render it: every shape below is plain,
   serialisable JSON that maps cleanly onto Postgres columns and jsonb, so
   the same records can later be served by an API and written by a private
   publishing client without a migration of meaning.

   Rules observed here:
     - No React, no MDX, no build-time-only constructs.
     - Prose is a block array, not a compiled component.
     - Every optional field is genuinely optional; the renderer decides
       what is worth showing, and never shows an empty row.
   ========================================================================= */

/* ---- Departments --------------------------------------------------------
   The two-letter code is load-bearing: it appears in every accession
   number, scopes the environmental colour, and selects the plate system. */

export const DEPARTMENT_CODES = [
  "OB",
  "PL",
  "FN",
  "PH",
  "TH",
  "AU",
  "XP",
  "DR",
] as const;

export const departmentCode = z.enum(DEPARTMENT_CODES);
export type DepartmentCode = z.infer<typeof departmentCode>;

export interface Department {
  code: DepartmentCode;
  /** Plural, as it appears in navigation. */
  name: string;
  /** Singular, as it appears on a record. */
  singular: string;
  /** URL segment. */
  slug: string;
  /** One line, institutional register, no wink. */
  charter: string;
  /** Which generative plate system represents an un-digitised record. */
  plate: "contour" | "topography" | "isobar" | "halftone" | "rule" | "waveform" | "lattice" | "diagram";
}

export const DEPARTMENTS: Record<DepartmentCode, Department> = {
  OB: {
    code: "OB",
    name: "Objects",
    singular: "Object",
    slug: "objects",
    charter: "Physical material retained without a stated reason.",
    plate: "contour",
  },
  PL: {
    code: "PL",
    name: "Places",
    singular: "Place",
    slug: "places",
    charter: "Locations recorded against their coordinates.",
    plate: "topography",
  },
  FN: {
    code: "FN",
    name: "Field Notes",
    singular: "Field Note",
    slug: "field-notes",
    charter: "Observations made at a particular time, in a particular weather.",
    plate: "isobar",
  },
  PH: {
    code: "PH",
    name: "Photographs",
    singular: "Photograph",
    slug: "photographs",
    charter: "Images held for their own sake.",
    plate: "halftone",
  },
  TH: {
    code: "TH",
    name: "Thoughts",
    singular: "Thought",
    slug: "thoughts",
    charter: "Fragments too short to be essays and too settled to be questions.",
    plate: "rule",
  },
  AU: {
    code: "AU",
    name: "Sounds",
    singular: "Recording",
    slug: "sounds",
    charter: "Audio taken from rooms, weather, machinery and open ground.",
    plate: "waveform",
  },
  XP: {
    code: "XP",
    name: "Experiments",
    singular: "Experiment",
    slug: "experiments",
    charter: "Interactive material produced because it could be.",
    plate: "lattice",
  },
  DR: {
    code: "DR",
    name: "Research",
    singular: "Paper",
    slug: "research",
    charter: "Investigations into questions that did not require answering.",
    plate: "diagram",
  },
};

export const DEPARTMENT_LIST: Department[] = DEPARTMENT_CODES.map(
  (code) => DEPARTMENTS[code],
);

/* ---- Accession ----------------------------------------------------------
   LN–XX–0000. The en-dashes are presentational only; the canonical stored
   form uses hyphens so the value survives URLs, filenames and SQL intact. */

export const accessionId = z
  .string()
  .regex(/^LN-(OB|PL|FN|PH|TH|AU|XP|DR)-\d{4}$/, {
    message: "Accession numbers take the form LN-XX-0000.",
  });

export type AccessionId = z.infer<typeof accessionId>;

/* ---- Significance -------------------------------------------------------
   Recorded on every item, presented entirely straight. `undetermined` is
   the honest default and by far the most common value in the archive. */

export const SIGNIFICANCE = [
  "undetermined",
  "negligible",
  "personal",
  "contested",
  "considerable",
] as const;

export const significance = z.enum(SIGNIFICANCE);
export type Significance = z.infer<typeof significance>;

/* ---- Status & visibility ------------------------------------------------ */

export const entryStatus = z.enum(["accessioned", "provisional", "withdrawn"]);
export type EntryStatus = z.infer<typeof entryStatus>;

export const visibility = z.enum(["public", "restricted"]);
export type Visibility = z.infer<typeof visibility>;

/* ---- Geography ----------------------------------------------------------
   Coordinates are decimal degrees, WGS 84. `precision` records how much
   the archive is willing to claim: an object found "somewhere along a
   forestry road" should not be plotted to six decimal places. */

export const coordinates = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Metres of uncertainty. Drives marker treatment on the survey plot. */
  precision: z.number().positive().optional(),
  /** Metres above sea level, where known. */
  elevation: z.number().optional(),
});

export type Coordinates = z.infer<typeof coordinates>;

export const place = z.object({
  /** As the archive refers to it, which is not always its real name. */
  name: z.string(),
  region: z.string().optional(),
  country: z.string().optional(),
  coordinates: coordinates.optional(),
});

export type Place = z.infer<typeof place>;

/* ---- Media --------------------------------------------------------------
   Sources are declared, never inferred at render time. `plate: true` marks
   a record as not yet digitised: the site draws a generative plate from
   the accession number instead, and does so deliberately rather than as a
   fallback. Real media, once present, always takes precedence. */

export const imageMedia = z.object({
  kind: z.literal("image"),
  src: z.string(),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Normalised 0–1 focal point, for art-directed crops. */
  focal: z.tuple([z.number(), z.number()]).optional(),
  /** Base64 LQIP, generated by the ingest pipeline. */
  placeholder: z.string().optional(),
  caption: z.string().optional(),
  /** Capture time from EXIF, where available. */
  captured: z.string().optional(),
});

export const audioMedia = z.object({
  kind: z.literal("audio"),
  src: z.string(),
  /** Spoken description of the recording, for screen readers. */
  alt: z.string(),
  /** Seconds. */
  duration: z.number().positive(),
  /** Pre-computed normalised 0–1 amplitude samples for the waveform. */
  peaks: z.array(z.number()).optional(),
  caption: z.string().optional(),
  captured: z.string().optional(),
});

export const media = z.discriminatedUnion("kind", [imageMedia, audioMedia]);

export type ImageMedia = z.infer<typeof imageMedia>;
export type AudioMedia = z.infer<typeof audioMedia>;
export type Media = z.infer<typeof media>;

/* ---- Prose blocks -------------------------------------------------------
   A small, closed set. Anything that cannot be expressed here does not
   belong in an archive record — it belongs in a Research paper, which has
   its own richer block set. */

export const proseBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("p"), text: z.string() }),
  /** Set larger, leads a record. At most one per entry. */
  z.object({ type: z.literal("lede"), text: z.string() }),
  /** Indented, quieter, in the institution's own voice. */
  z.object({ type: z.literal("note"), text: z.string() }),
  z.object({
    type: z.literal("quote"),
    text: z.string(),
    attribution: z.string().optional(),
  }),
  z.object({
    type: z.literal("list"),
    items: z.array(z.string()),
    ordered: z.boolean().optional(),
  }),
  /** Two-column measured data, set in mono. */
  z.object({
    type: z.literal("measurements"),
    rows: z.array(z.tuple([z.string(), z.string()])),
  }),
  /** References a media index on the same entry. */
  z.object({
    type: z.literal("figure"),
    media: z.number().int().nonnegative(),
    caption: z.string().optional(),
    /** How much of the page the figure claims. */
    scale: z.enum(["inset", "column", "full", "bleed"]).default("column"),
  }),
]);

export type ProseBlock = z.infer<typeof proseBlock>;

/* ---- Footnotes ----------------------------------------------------------
   Archival footnotes are one of the places the institution's character
   lives. They are referenced from prose by index and rendered in the
   margin on wide viewports. */

export const footnote = z.object({
  marker: z.string(),
  text: z.string(),
});

export type Footnote = z.infer<typeof footnote>;

/* ---- Entry --------------------------------------------------------------
   The central record. Everything the public site renders derives from
   this; nothing about presentation is stored on it. */

export const entry = z.object({
  id: accessionId,
  dept: departmentCode,
  /** URL segment. Stable once published — the accession number also resolves. */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),

  title: z.string(),
  /** One or two lines. Used in the index, on cards, and in metadata. */
  summary: z.string().optional(),

  body: z.array(proseBlock).default([]),
  footnotes: z.array(footnote).default([]),

  /** ISO 8601 date the item is *about*. Sorts the chronology. */
  date: z.string(),
  /** When the archive took possession, if that differs meaningfully. */
  acquired: z.string().optional(),

  place: place.optional(),

  /** Collection slugs. An entry may belong to any number, including none. */
  collections: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),

  media: z.array(media).default([]),

  /* Descriptive fields. Shown only where they carry information — the
     renderer omits any row whose value is absent. */
  material: z.string().optional(),
  dimensions: z.string().optional(),
  mass: z.string().optional(),
  weather: z.string().optional(),
  source: z.string().optional(),

  significance: significance.default("undetermined"),
  status: entryStatus.default("accessioned"),
  visibility: visibility.default("public"),

  /** Accession numbers of related records. Rendered as cross-references. */
  related: z.array(accessionId).default([]),

  /** Free-form institutional annotation. Rarely present, always dry. */
  remark: z.string().optional(),
});

export type Entry = z.infer<typeof entry>;
/** The shape as authored, before defaults are applied. */
export type EntryInput = z.input<typeof entry>;

/* ---- Collections --------------------------------------------------------
   Curated rather than folder-like: a collection is an editorial act with
   its own title, note and environmental identity, and an entry may sit in
   several at once. */

export const collection = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string(),
  /** The curatorial note. Written straight. */
  note: z.string(),
  /** Optional environmental override; otherwise inherits per-entry. */
  dept: departmentCode.optional(),
  /** Accession number of the record that represents the collection. */
  keystone: accessionId.optional(),
  opened: z.string(),
  closed: z.string().optional(),
});

export type Collection = z.infer<typeof collection>;

/* ---- Research -----------------------------------------------------------
   Department of Unnecessary Research. A paper is an entry with a longer
   body and a stated question it did not need to answer. */

export const researchPaper = entry.extend({
  dept: z.literal("DR"),
  /** The question. Displayed prominently, answered eventually or not. */
  question: z.string(),
  /** The finding, if one was reached. */
  finding: z.string().optional(),
  /** Methods, where the joke is that they are rigorous. */
  method: z.array(z.string()).default([]),
});

export type ResearchPaper = z.infer<typeof researchPaper>;

/* ---- Derived shapes ----------------------------------------------------- */

/** The projection used by the index, search and any listing surface. */
export interface EntrySummary {
  id: AccessionId;
  dept: DepartmentCode;
  slug: string;
  title: string;
  summary?: string;
  date: string;
  place?: Place;
  collections: string[];
  significance: Significance;
  /** First image, where one exists. Absent means: draw a plate. */
  thumbnail?: ImageMedia;
}

export function toSummary(e: Entry): EntrySummary {
  const thumbnail = e.media.find((m): m is ImageMedia => m.kind === "image");
  return {
    id: e.id,
    dept: e.dept,
    slug: e.slug,
    title: e.title,
    summary: e.summary,
    date: e.date,
    place: e.place,
    collections: e.collections,
    significance: e.significance,
    thumbnail,
  };
}
