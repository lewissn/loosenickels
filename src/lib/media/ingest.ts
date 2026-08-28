import { readExif, exifToParts, type ExifData } from "./exif";
import type { Camera, Coordinates } from "@/lib/archive/schema";

/* =========================================================================
   Ingest

   Everything the archive can learn about a photograph from the photograph,
   derived in the browser before a single byte is uploaded.

   Doing it here rather than on a server is deliberate. It means the compose
   screen can show a real preview, the true capture date and the place name
   immediately, with no round trip — and it means the same routine runs
   whether or not object storage exists yet, so the whole flow can be built
   and used before there is a backend to receive it.

   The server will still verify dimensions and re-derive what it needs when
   the upload lands. Nothing a client computes is trusted for authorisation;
   this is for the interface, and for filling in fields the user would
   otherwise have to type.
   ========================================================================= */

export interface Ingested {
  /** The file itself, untouched. Originals are preserved. */
  file: File;

  width: number;
  height: number;
  /** SHA-256 of the bytes. Makes a retried upload the same upload. */
  checksum: string;

  /** Object URL for the preview. Revoke it when the preview goes away. */
  previewUrl: string;
  /** Tiny inline image, shown while the real one decodes. */
  placeholder: string;

  /** Average perceived lightness, 0-1. Decides how dark the room goes. */
  lightness: number;
  /** A restrained tone drawn from the image, for the ambient ground. */
  tone: string;

  /** Wall-clock capture reading and offset, where the file recorded them. */
  capturedAtLocal?: string;
  captureOffset?: string;

  coordinates?: Coordinates;
  camera?: Camera;

  exif: ExifData;
}

/** Longest edge of the sample used for colour analysis. Small on purpose. */
const SAMPLE = 48;
/** Longest edge of the inline placeholder. */
const LQIP = 20;

export async function ingest(file: File): Promise<Ingested> {
  const buffer = await file.arrayBuffer();

  const exif = readExif(buffer);
  const checksum = await sha256(buffer);

  /* createImageBitmap applies EXIF orientation for us when asked, which
     matters: a phone photograph is very often stored sideways with a tag
     saying which way is up, and every dimension downstream would be
     transposed if we read the stored size rather than the displayed one. */
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const width = bitmap.width;
  const height = bitmap.height;

  const { lightness, tone } = analyse(bitmap);
  const placeholder = renderPlaceholder(bitmap);
  bitmap.close();

  const parts = exifToParts(exif);

  return {
    file,
    width,
    height,
    checksum,
    previewUrl: URL.createObjectURL(file),
    placeholder,
    lightness,
    tone,
    capturedAtLocal: parts?.wallClock,
    captureOffset: parts?.offset,
    coordinates: toCoordinates(exif),
    camera: toCamera(exif),
    exif,
  };
}

/* ---- Colour -------------------------------------------------------------
   Both values come from one downsample. The browser's own image scaling does
   the averaging far better and far faster than reading a million pixels. */

function analyse(bitmap: ImageBitmap): { lightness: number; tone: string } {
  const scale = SAMPLE / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { lightness: 0.5, tone: "#808080" };

  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let r = 0;
  let g = 0;
  let b = 0;
  let luma = 0;
  let n = 0;

  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i] ?? 0;
    const pg = data[i + 1] ?? 0;
    const pb = data[i + 2] ?? 0;
    r += pr;
    g += pg;
    b += pb;
    /* Rec. 709 luma. Perceived brightness, not the arithmetic mean of the
       channels — green carries most of what the eye reads as light. */
    luma += (0.2126 * pr + 0.7152 * pg + 0.0722 * pb) / 255;
    n++;
  }

  if (n === 0) return { lightness: 0.5, tone: "#808080" };

  /* The average of a whole photograph is usually a muddy grey-brown, which
     is exactly what is wanted: the ground takes a *cast* from the image, and
     a saturated accent pulled from one bright object would tint the room the
     colour of somebody's coat. */
  return {
    lightness: luma / n,
    tone: hex(r / n, g / n, b / n),
  };
}

function renderPlaceholder(bitmap: ImageBitmap): string {
  const scale = LQIP / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(bitmap, 0, 0, w, h);
  /* Low quality on purpose: this is a colour impression to sit under the
     real image while it decodes, and it travels inline in the payload. */
  return canvas.toDataURL("image/jpeg", 0.4);
}

function hex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/* ---- Derived records ---------------------------------------------------- */

function toCoordinates(exif: ExifData): Coordinates | undefined {
  if (exif.latitude === undefined || exif.longitude === undefined) return undefined;
  return {
    lat: exif.latitude,
    lon: exif.longitude,
    ...(exif.altitude !== undefined ? { elevation: exif.altitude } : {}),
  };
}

function toCamera(exif: ExifData): Camera | undefined {
  const camera: Camera = {};
  if (exif.make) camera.make = exif.make;
  if (exif.model) camera.model = exif.model;
  if (exif.lens) camera.lens = exif.lens;
  if (exif.focalLength) camera.focalLength = exif.focalLength;
  if (exif.aperture) camera.aperture = exif.aperture;
  if (exif.shutterSpeed) camera.shutterSpeed = exif.shutterSpeed;
  if (exif.iso) camera.iso = exif.iso;
  return Object.keys(camera).length > 0 ? camera : undefined;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  /* crypto.subtle needs a secure context. localhost counts; a plain-http
     deployment would not, so fall back rather than failing an upload over
     an identifier that only exists to make retries safe. */
  if (!globalThis.crypto?.subtle) return fallbackHash(buffer);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** FNV-1a over the bytes. Weaker, and enough to tell two uploads apart. */
function fallbackHash(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16)}-${bytes.length}`;
}
