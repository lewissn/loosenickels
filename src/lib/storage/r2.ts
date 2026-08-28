import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageEnv } from "@/lib/env.server";

/* Cloudflare R2, spoken to as S3. The bucket has no public access at all:
   nothing here ever produces a durable URL, and every read is signed for
   the person who asked, after their session has been checked. */

let client: S3Client | undefined;

function s3() {
  if (client) return client;
  const env = storageEnv();

  client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    /* Bucket in the path, not in the hostname. It is the form Cloudflare
       documents, and it keeps the bucket's name out of the certificate's
       business. */
    forcePathStyle: true,
    /* Recent SDKs add a CRC32 checksum header to every upload by default.
       A browser cannot compute one before sending, so a presigned PUT that
       demands it can never be satisfied and fails as a signature mismatch,
       which reads like a credentials problem and is not one. */
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return client;
}

const bucket = () => storageEnv().R2_BUCKET;

/* What a camera or a phone will hand over, and the extension each is
   filed under. Anything not named here is refused before a URL is signed,
   so the bucket only ever contains formats the pipeline can read. */
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

export type MediaVariant = "original" | "large" | "medium" | "thumbnail";

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

/* Two minutes: long enough to start a large upload over a poor connection,
   short enough that a link left in a log is of no use to anybody.

   Type and length are named as signable, which is what actually binds them
   into the signature — set on the command alone they are sent but not
   signed, and a URL minted for one photograph could then be spent on a
   hundred megabytes of something else. */
export function signedUpload(key: string, contentType: string, byteSize: number) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
      ContentLength: byteSize,
    }),
    {
      expiresIn: 120,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );
}

/* Fifteen minutes. A page holds its photographs for as long as it is open,
   and a URL that outlives the visit is a URL that can be passed on. */
export function signedRead(key: string, expiresIn = 900) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  );
}

/* Asked after an upload claims to have finished, because the claim comes
   from the client and the bucket is the only thing that actually knows. */
export async function describeObject(key: string) {
  try {
    const head = await s3().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key }),
    );
    return {
      byteSize: head.ContentLength ?? 0,
      contentType: head.ContentType ?? "application/octet-stream",
      checksum: head.ETag?.replaceAll('"', "") ?? null,
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
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}
