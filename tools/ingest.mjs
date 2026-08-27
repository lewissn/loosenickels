/**
 * Digitisation.
 *
 * Reads every image referenced by a record, and writes back the things
 * the record cannot know about itself: its true pixel dimensions, the
 * moment it was captured, and a placeholder small enough to inline.
 *
 * This exists because the alternative is filling those fields in by hand,
 * and a pipeline that depends on someone filling in four fields by hand
 * is a pipeline that gets used twice.
 *
 *   node tools/ingest.mjs [--check]
 *
 * --check reports what it would do and exits non-zero if anything is
 * outstanding, without writing. Everything else writes in place and
 * reports what changed.
 */

import { readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import exifReader from "exif-reader";

const ROOT = process.cwd();
const RECORDS = path.join(ROOT, "src/content/records");
const PUBLIC = path.join(ROOT, "public");

const CHECK = process.argv.includes("--check");

/** An image whose EXIF says it is rotated reports its pre-rotation size. */
function displayDimensions(metadata) {
  const turned = (metadata.orientation ?? 1) >= 5;
  return turned
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}

/** EXIF capture time, as an ISO date. The archive records days, not seconds. */
function capturedFrom(metadata) {
  if (!metadata.exif) return undefined;
  try {
    const exif = exifReader(metadata.exif);
    const taken =
      exif?.Photo?.DateTimeOriginal ??
      exif?.Photo?.DateTimeDigitized ??
      exif?.Image?.DateTime;
    if (!taken) return undefined;
    const date = taken instanceof Date ? taken : new Date(taken);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString().slice(0, 10);
  } catch {
    /* A malformed EXIF block is not a reason to fail a build. */
    return undefined;
  }
}

/**
 * A placeholder small enough to sit inside the HTML.
 *
 * Twenty-four pixels wide, blurred, and it still carries the tonality of
 * the photograph well enough that the frame is never empty. Roughly half
 * a kilobyte.
 */
async function placeholderFor(file) {
  const buffer = await sharp(file)
    .rotate()
    .resize(24, 24, { fit: "inside" })
    .blur(1.2)
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function ingest() {
  const names = (await readdir(RECORDS)).filter((n) => n.endsWith(".json")).sort();

  let changed = 0;
  let missing = 0;

  for (const name of names) {
    const file = path.join(RECORDS, name);
    const record = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(record.media) || record.media.length === 0) continue;

    let touched = false;

    for (const item of record.media) {
      if (item.kind !== "image") continue;
      /* Remote media is somebody else's problem. */
      if (!item.src?.startsWith("/")) continue;

      const image = path.join(PUBLIC, item.src);
      if (!(await exists(image))) {
        console.warn(`  ${record.id}  missing file  ${item.src}`);
        missing += 1;
        continue;
      }

      const metadata = await sharp(image).metadata();
      const { width, height } = displayDimensions(metadata);

      /* The record may claim dimensions it got from whatever uploaded it.
         The file is the authority, so the file wins. */
      if (width && item.width !== width) {
        item.width = width;
        touched = true;
      }
      if (height && item.height !== height) {
        item.height = height;
        touched = true;
      }

      if (!item.placeholder) {
        item.placeholder = await placeholderFor(image);
        touched = true;
      }

      if (!item.captured) {
        const captured = capturedFrom(metadata);
        if (captured) {
          item.captured = captured;
          touched = true;
        }
      }
    }

    if (touched) {
      changed += 1;
      console.log(`  ${record.id}  digitised`);
      if (!CHECK) {
        await writeFile(file, JSON.stringify(record, null, 2) + "\n", "utf8");
      }
    }
  }

  if (missing > 0) {
    console.warn(`\n${missing} referenced file(s) not found.`);
  }

  if (changed === 0) {
    console.log("Nothing outstanding. Every image is already digitised.");
    return 0;
  }

  console.log(
    `\n${changed} record(s) ${CHECK ? "would be" : ""} updated.`.replace(/\s+/g, " "),
  );
  return CHECK ? 1 : 0;
}

process.exit(await ingest());
