/* =========================================================================
   EXIF

   A focused reader for the handful of tags this product actually uses. Not a
   general metadata library: it reads a JPEG's APP1 segment, walks the TIFF
   structure inside it, and returns capture time, capture offset, position,
   camera and orientation. Everything else is ignored.

   Written by hand rather than pulled in, because the alternatives are
   hundreds of kilobytes to answer six questions, and this runs in the
   browser on every upload.

   Nothing here is required. Screenshots, exported images and anything that
   has been through a messaging app carry no EXIF at all, and a photograph
   without metadata must still be as easy to record as one with it — so every
   field is optional and a parse failure returns an empty result rather than
   throwing.
   ========================================================================= */

export interface ExifData {
  /** "2026:08:28 18:42:11" as recorded, before any zone is applied. */
  capturedAtLocal?: string;
  /** "+09:00", where the camera bothered to record it. */
  captureOffset?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: number;
  aperture?: number;
  shutterSpeed?: number;
  iso?: number;
  /** 1-8, the TIFF orientation. 1 means upright. */
  orientation?: number;
}

/* TIFF tags, named so the walk below reads as intent rather than as magic. */
const TAG = {
  MAKE: 0x010f,
  MODEL: 0x0110,
  ORIENTATION: 0x0112,
  EXIF_IFD: 0x8769,
  GPS_IFD: 0x8825,

  EXPOSURE_TIME: 0x829a,
  F_NUMBER: 0x829d,
  ISO: 0x8827,
  DATE_TIME_ORIGINAL: 0x9003,
  OFFSET_TIME_ORIGINAL: 0x9011,
  FOCAL_LENGTH: 0x920a,
  LENS_MODEL: 0xa434,

  GPS_LAT_REF: 0x0001,
  GPS_LAT: 0x0002,
  GPS_LON_REF: 0x0003,
  GPS_LON: 0x0004,
  GPS_ALT_REF: 0x0005,
  GPS_ALT: 0x0006,
} as const;

/** Bytes per component, indexed by TIFF type. Index 0 is unused. */
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

export function readExif(buffer: ArrayBuffer): ExifData {
  try {
    return parse(buffer);
  } catch {
    /* A malformed or absent header is the normal case, not an error worth
       reporting. The upload proceeds without metadata. */
    return {};
  }
}

function parse(buffer: ArrayBuffer): ExifData {
  const view = new DataView(buffer);
  if (view.byteLength < 4) return {};

  /* JPEG starts FF D8, then a chain of segments. We want APP1 (FF E1) whose
     payload begins "Exif\0\0". */
  if (view.getUint16(0) !== 0xffd8) return {};

  let offset = 2;
  let tiffStart = -1;

  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);

    if (marker === 0xe1) {
      const header = offset + 4;
      if (
        view.getUint32(header) === 0x45786966 && // "Exif"
        view.getUint16(header + 4) === 0x0000
      ) {
        tiffStart = header + 6;
        break;
      }
    }

    /* SOS: image data begins and there are no more metadata segments. */
    if (marker === 0xda) break;
    offset += 2 + size;
  }

  if (tiffStart < 0) return {};

  /* The TIFF header declares its own endianness — "II" little, "MM" big. */
  const endian = view.getUint16(tiffStart);
  const little = endian === 0x4949;
  if (!little && endian !== 0x4d4d) return {};
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return {};

  const ifd0 = tiffStart + view.getUint32(tiffStart + 4, little);
  const out: ExifData = {};

  const root = readIfd(view, ifd0, tiffStart, little);

  out.make = asString(root.get(TAG.MAKE));
  out.model = asString(root.get(TAG.MODEL));
  out.orientation = asNumber(root.get(TAG.ORIENTATION));

  const exifPointer = asNumber(root.get(TAG.EXIF_IFD));
  if (exifPointer !== undefined) {
    const exif = readIfd(view, tiffStart + exifPointer, tiffStart, little);
    out.capturedAtLocal = asString(exif.get(TAG.DATE_TIME_ORIGINAL));
    out.captureOffset = asString(exif.get(TAG.OFFSET_TIME_ORIGINAL));
    out.lens = asString(exif.get(TAG.LENS_MODEL));
    out.focalLength = asNumber(exif.get(TAG.FOCAL_LENGTH));
    out.aperture = asNumber(exif.get(TAG.F_NUMBER));
    out.shutterSpeed = asNumber(exif.get(TAG.EXPOSURE_TIME));
    out.iso = asNumber(exif.get(TAG.ISO));
  }

  const gpsPointer = asNumber(root.get(TAG.GPS_IFD));
  if (gpsPointer !== undefined) {
    const gps = readIfd(view, tiffStart + gpsPointer, tiffStart, little);

    const lat = asDegrees(gps.get(TAG.GPS_LAT), asString(gps.get(TAG.GPS_LAT_REF)));
    const lon = asDegrees(gps.get(TAG.GPS_LON), asString(gps.get(TAG.GPS_LON_REF)));
    if (lat !== undefined) out.latitude = lat;
    if (lon !== undefined) out.longitude = lon;

    const alt = asNumber(gps.get(TAG.GPS_ALT));
    if (alt !== undefined) {
      /* Reference 1 means below sea level. */
      out.altitude = asNumber(gps.get(TAG.GPS_ALT_REF)) === 1 ? -alt : alt;
    }
  }

  return out;
}

type Value = string | number | number[] | undefined;

/** One image file directory: a count, then that many 12-byte entries. */
function readIfd(
  view: DataView,
  start: number,
  tiffStart: number,
  little: boolean,
): Map<number, Value> {
  const out = new Map<number, Value>();
  if (start + 2 > view.byteLength) return out;

  const entries = view.getUint16(start, little);

  for (let i = 0; i < entries; i++) {
    const entry = start + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;

    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const count = view.getUint32(entry + 4, little);
    const size = (TYPE_SIZE[type] ?? 0) * count;
    if (size === 0) continue;

    /* Four bytes or fewer live in the entry itself; anything larger is a
       pointer relative to the start of the TIFF block. */
    const at = size <= 4 ? entry + 8 : tiffStart + view.getUint32(entry + 8, little);
    if (at < 0 || at + size > view.byteLength) continue;

    out.set(tag, readValue(view, at, type, count, little));
  }

  return out;
}

function readValue(
  view: DataView,
  at: number,
  type: number,
  count: number,
  little: boolean,
): Value {
  switch (type) {
    case 2: {
      /* ASCII, NUL-terminated and often NUL-padded. */
      let s = "";
      for (let i = 0; i < count; i++) {
        const c = view.getUint8(at + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    case 1:
    case 6:
      return view.getUint8(at);
    case 3:
      return view.getUint16(at, little);
    case 4:
      return view.getUint32(at, little);
    case 5:
    case 10: {
      /* Rationals: numerator then denominator. Several tags are arrays of
         them — GPS coordinates are three, being degrees, minutes, seconds. */
      const out: number[] = [];
      for (let i = 0; i < count; i++) {
        const p = at + i * 8;
        const n = type === 5 ? view.getUint32(p, little) : view.getInt32(p, little);
        const d = type === 5 ? view.getUint32(p + 4, little) : view.getInt32(p + 4, little);
        out.push(d === 0 ? 0 : n / d);
      }
      return count === 1 ? out[0] : out;
    }
    default:
      return undefined;
  }
}

function asString(v: Value): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asNumber(v: Value): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Degrees, minutes and seconds to a signed decimal degree. */
function asDegrees(v: Value, ref: string | undefined): number | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined;
  const [d = 0, m = 0, s = 0] = v;
  const value = d + m / 60 + s / 3600;
  if (!Number.isFinite(value)) return undefined;
  return ref === "S" || ref === "W" ? -value : value;
}

/**
 * EXIF's local timestamp plus its offset, as a real instant.
 *
 * EXIF writes "2026:08:28 18:42:11" with colons in the date and, if you are
 * lucky, a separate offset tag. Without the offset there is no way to know
 * what moment this was — so rather than guessing UTC and silently filing the
 * photograph on the wrong day, this returns the wall-clock reading and lets
 * the caller decide, using the zone it actually knows about.
 */
export function exifToParts(
  exif: ExifData,
): { wallClock: string; offset?: string } | undefined {
  const raw = exif.capturedAtLocal;
  if (!raw) return undefined;

  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;

  const [, y, mo, d, h, mi, s] = m;
  return {
    wallClock: `${y}-${mo}-${d}T${h}:${mi}:${s}`,
    offset: exif.captureOffset?.trim(),
  };
}
