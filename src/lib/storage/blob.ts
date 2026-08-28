import "server-only";
import { head, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { IssuedSignedToken } from "@vercel/blob";
import type { VariantName } from "@/lib/archive/schema";

/* =========================================================================
   Vercel Blob, private store.

   The store is created with `access: "private"`, which cannot be changed
   afterwards. Nothing here ever produces a durable URL: every read is
   signed for the person who asked, after their session has been checked and
   after row level security has agreed there is a row to read.

   Credentials are not in this file and not in the environment schema. On
   Vercel the SDK authenticates with a short-lived OIDC token that the
   platform rotates on its own; locally `vercel env pull` provides the same
   variables. There is no long-lived storage secret to leak from a `.env`.
   ========================================================================= */

/* What a camera or a phone will hand over, and the extension each is filed
   under. Anything not named here is refused before a URL is signed, so the
   store only ever contains formats the pipeline can read. */
const ORIGINAL_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/* Derivatives are made here rather than accepted, so the list is ours. */
const DERIVATIVE_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/* A 48-megapixel HEIC runs to about 15 MB. This is well clear of that and
   still far short of a mistake worth paying to store. */
export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;

/* Re-exported from the schema rather than declared again. Two hand-kept
   lists of the same enum is how `thumb` and `thumbnail` came to mean the
   same thing in different files. */
export type MediaVariant = VariantName;

export function extensionFor(variant: MediaVariant, contentType: string) {
  const table = variant === "original" ? ORIGINAL_TYPES : DERIVATIVE_TYPES;
  return table[contentType];
}

/* Keyed by revision, which is a uuid the reader never gets to choose. A
   revision is written once and never rewritten, so a key always refers to
   the same bytes and can be cached hard once it has been signed for.

   Neutral, like everything else that outlives the codename: the prefix
   describes what is stored, not who stores it. */
export function objectKey(
  revisionId: string,
  variant: MediaVariant,
  contentType: string,
) {
  const extension = extensionFor(variant, contentType);
  if (!extension) throw new Error(`Unsupported content type: ${contentType}`);
  return `photos/${revisionId}/${variant}.${extension}`;
}

/* -------------------------------------------------------------------------
   The read delegation

   `issueSignedToken` is a call to the Blob control API; `presignUrl` is
   local HMAC. Issuing one token per photograph would put a network
   round-trip in front of every image on a page that shows two dozen days,
   so one store-wide read delegation is issued and reused until it is nearly
   expired, and each URL is signed from it in memory.

   Widening the delegation does not widen what anybody receives. The
   signing key never leaves the server; a reader is only ever handed a URL
   already signed for one pathname, and the CDN rejects anything else.
   ------------------------------------------------------------------------- */

const DELEGATION_TTL_MS = 60 * 60 * 1000;
/* Renewed a minute early, so a URL signed at the last moment is not handed
   out already dead. */
const RENEW_BEFORE_MS = 60 * 1000;

let readDelegation: IssuedSignedToken | undefined;

async function readToken() {
  if (readDelegation && readDelegation.validUntil - RENEW_BEFORE_MS > Date.now()) {
    return readDelegation;
  }

  readDelegation = await issueSignedToken({
    operations: ["get"],
    validUntil: Date.now() + DELEGATION_TTL_MS,
  });

  return readDelegation;
}

/* Two minutes: long enough to start a large upload over a poor connection,
   short enough that a link left in a log is of no use to anybody.

   Type and size are named twice on purpose — once on the delegation and
   once on the URL. The CDN enforces both, so a URL minted for one
   photograph cannot be spent on a hundred megabytes of something else.
   Under R2 this needed `signableHeaders` to bind the headers into the
   signature; here the constraint is carried in the delegation payload
   rather than in a header the client controls. */
export async function signedUpload(
  key: string,
  contentType: string,
  byteSize: number,
) {
  const token = await issueSignedToken({
    pathname: key,
    operations: ["put"],
    allowedContentTypes: [contentType],
    maximumSizeInBytes: byteSize,
    validUntil: Date.now() + 2 * 60 * 1000,
  });

  const { presignedUrl } = await presignUrl(token, {
    operation: "put",
    pathname: key,
    access: "private",
    allowedContentTypes: [contentType],
    maximumSizeInBytes: byteSize,
    /* The key already carries a revision uuid, so it is unique without
       help — and a suffix would make it unguessable to us as well. */
    addRandomSuffix: false,
    /* A revision is written once. Refusing the second write is what makes a
       retry safe: it cannot quietly replace bytes already recorded. */
    allowOverwrite: false,
  });

  return presignedUrl;
}

/* Fifteen minutes. A page holds its photographs for as long as it is open,
   and a URL that outlives the visit is a URL that can be passed on. */
export async function signedRead(key: string, expiresIn = 900) {
  const { presignedUrl } = await presignUrl(await readToken(), {
    operation: "get",
    pathname: key,
    access: "private",
    validUntil: Date.now() + expiresIn * 1000,
  });

  return presignedUrl;
}

/* Asked after an upload claims to have finished, because the claim comes
   from the client and the store is the only thing that actually knows. */
export async function describeObject(key: string) {
  try {
    const found = await head(key);
    return {
      byteSize: found.size,
      contentType: found.contentType ?? "application/octet-stream",
      checksum: found.etag?.replaceAll('"', "") ?? null,
    };
  } catch {
    return null;
  }
}

/* Derivatives go up from the server, where their size is known and small. */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
) {
  /* `put` takes a Buffer, a Blob or a stream. Callers hand over the plain
     Uint8Array that an image library returns, so the view is wrapped rather
     than copied — same bytes, same backing memory. */
  await put(key, Buffer.from(body.buffer, body.byteOffset, body.byteLength), {
    access: "private",
    contentType,
    addRandomSuffix: false,
    /* Unlike an original, a derivative may legitimately be remade — a
       better resize, a corrected orientation — against a revision that has
       not changed. */
    allowOverwrite: true,
  });
}
