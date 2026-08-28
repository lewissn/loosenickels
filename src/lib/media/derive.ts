import "server-only";
import sharp, { type Sharp } from "sharp";
import { objectKey, putObject, signedRead } from "@/lib/storage/blob";
import type { VariantName } from "@/lib/archive/schema";

/* =========================================================================
   Making the renditions.

   An original is preserved exactly as the camera wrote it and is never
   served to anyone but its owner, because its embedded EXIF carries the GPS
   tag out past any redaction of the location columns. Everything a visitor
   ever sees is made here, from those bytes, with the metadata dropped.

   Three sizes, not a continuum. A year of thumbnails, a page of mediums and
   one large is the whole of what the surfaces ask for, and a resize that
   nothing requests is storage nobody reads.
   ========================================================================= */

/** What this pipeline writes. `original` and `source` are what it reads. */
export type Rendition = Extract<VariantName, "large" | "medium" | "thumbnail">;

/** Longest edge, in pixels. Never upscaled — a small original stays small. */
const EDGES: Record<Rendition, number> = {
  large: 2400,
  medium: 1200,
  thumbnail: 400,
};

/* WebP throughout. It decodes everywhere the product runs, carries an alpha
   channel for the rare screenshot that has one, and is roughly a third of
   the JPEG for the same apparent quality at these sizes. */
const OUTPUT_TYPE = "image/webp";

/** Longest edge of the inline placeholder, which lives in a database column
    and is shown for a fraction of a second while the real one decodes. */
const PLACEHOLDER_EDGE = 20;

export interface Derived {
  variants: Array<{
    variant: Rendition;
    storageKey: string;
    width: number;
    height: number;
    byteSize: number;
    contentType: string;
  }>;
  /** Orientation resolved. The shape the photograph actually displays at. */
  width: number;
  height: number;
  placeholder: string;
  /** Rec. 709 luma, 0–1. Decides how dark the room around it goes. */
  lightness: number;
  /** One restrained colour from the image, `#rrggbb`, for the ground. */
  tone: string;
}

/**
 * A photograph this pipeline cannot read.
 *
 * Separate from an ordinary failure because the answer is different: a
 * transient error is worth retrying and this never will be. The message is
 * written to `failure_reason` and shown to the owner, so it has to say what
 * to do rather than what went wrong.
 */
export class UndecodableImage extends Error {
  constructor(readonly format: string | undefined) {
    super(
      format === "heif"
        ? "This is a HEIC photograph, and the server cannot open that format. Record it from the iOS app, or set the camera to Most Compatible."
        : `This file is a ${format ?? "format"} the archive cannot open.`,
    );
    this.name = "UndecodableImage";
  }
}

export async function derive(
  revisionId: string,
  originalKey: string,
): Promise<Derived> {
  /* Fetched through a signed URL rather than a direct read, so the pipeline
     goes through the same door as everything else and there is one way in
     to audit rather than two. */
  const response = await fetch(await signedRead(originalKey, 300));
  if (!response.ok) {
    throw new Error(`The original could not be fetched (${response.status}).`);
  }
  const original = Buffer.from(await response.arrayBuffer());

  const probe = sharp(original, { failOn: "none" });
  const metadata = await probe.metadata();

  /* sharp reads HEIC *metadata* — it will tell you the dimensions and that
     the compression is hevc — and then cannot decode a single pixel, because
     the prebuilt binaries ship without an HEVC decoder for licensing
     reasons. Finding that out at `toBuffer()` produces an unreadable libvips
     error, so it is caught here where there is something useful to say. */
  if (metadata.format === "heif" && metadata.compression === "hevc") {
    throw new UndecodableImage("heif");
  }

  /* `rotate()` with no argument applies the EXIF orientation and then drops
     the tag, so every rendition below is upright and its stored dimensions
     are the dimensions it displays at. */
  const upright = sharp(original, { failOn: "none" }).rotate();

  let base: Sharp;
  let width: number;
  let height: number;
  try {
    const { data, info } = await upright
      .clone()
      .raw()
      .toBuffer({ resolveWithObject: true });
    width = info.width;
    height = info.height;
    base = sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    });
  } catch {
    throw new UndecodableImage(metadata.format);
  }

  const variants: Derived["variants"] = [];

  for (const [name, edge] of Object.entries(EDGES) as Array<[Rendition, number]>) {
    const rendered = await base
      .clone()
      .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: name === "thumbnail" ? 70 : 82 })
      .toBuffer({ resolveWithObject: true });

    const key = objectKey(revisionId, name, OUTPUT_TYPE);
    await putObject(key, rendered.data, OUTPUT_TYPE);

    variants.push({
      variant: name,
      storageKey: key,
      width: rendered.info.width,
      height: rendered.info.height,
      byteSize: rendered.data.length,
      contentType: OUTPUT_TYPE,
    });
  }

  return {
    variants,
    width,
    height,
    placeholder: await placeholderFor(base, width, height),
    ...(await environmentOf(base)),
  };
}

/** A data URI small enough to sit in a database column and be sent inline. */
async function placeholderFor(
  base: Sharp,
  width: number,
  height: number,
): Promise<string> {
  const longest = Math.max(width, height) || 1;
  const scale = PLACEHOLDER_EDGE / longest;

  const buffer = await base
    .clone()
    .resize(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
      { fit: "fill" },
    )
    .webp({ quality: 40 })
    .toBuffer();

  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

/**
 * What the photograph does to the room: its lightness, and one colour.
 *
 * Not the mean of the channels: green reads far brighter to the eye than
 * blue at the same value, and averaging them makes a deep blue photograph
 * look, arithmetically, as bright as a pale green one. The room is lit from
 * this number, so getting it wrong is visible rather than academic.
 */
async function environmentOf(
  base: Sharp,
): Promise<{ lightness: number; tone: string }> {
  const { data, info } = await base
    .clone()
    .resize(32, 32, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let luma = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = info.width * info.height;

  for (let i = 0; i < data.length; i += info.channels) {
    const [red, green, blue] = [data[i]!, data[i + 1]!, data[i + 2]!];
    /* Rec. 709, not the mean of the channels: green reads far brighter to
       the eye than blue at the same value, and averaging them makes a deep
       blue photograph arithmetically as bright as a pale green one. The room
       is lit from this number, so being wrong is visible rather than
       academic. */
    luma += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    r += red;
    g += green;
    b += blue;
  }

  if (!pixels) return { lightness: 0.5, tone: "#808080" };

  /* The mean colour, pulled well toward neutral. A ground carrying the
     photograph's full average reads as a coloured wash behind it and
     competes; carrying a sixth of it reads as the light in the room. */
  const toward = (channel: number) =>
    Math.round(128 + (channel / pixels - 128) * 0.35);

  const hex = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

  return {
    lightness: luma / pixels / 255,
    tone: `#${hex(toward(r))}${hex(toward(g))}${hex(toward(b))}`,
  };
}
