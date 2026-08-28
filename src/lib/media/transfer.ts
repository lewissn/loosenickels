import type { Ingested } from "./ingest";

/* =========================================================================
   Getting the bytes there.

   Three steps, run from the browser, because the photograph never passes
   through the server: a serverless function caps its request body at a few
   megabytes and a photograph from a modern phone is larger than that.

     POST /api/uploads           reserve a key, get a URL signed for 120s
     PUT  <that URL>             the file, straight to object storage
     POST /api/uploads/register  the server asks the store whether it
                                 arrived and writes down the store's answer

   What comes back is an asset id, belonging to the uploader and to no day
   yet. Which day it is the photograph for is a separate call, and that
   separation is the point: a commit that fails can be retried without
   sending the photograph again.
   ========================================================================= */

export class TransferError extends Error {
  constructor(
    message: string,
    /** True when trying again might work — a timeout, a flaky connection. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TransferError";
  }
}

async function problemFrom(response: Response, fallback: string) {
  const said = await response
    .json()
    .then((b: { problem?: string }) => b.problem)
    .catch(() => undefined);

  return said ?? fallback;
}

export async function transfer(shot: Ingested): Promise<string> {
  const file = shot.file;

  const reserved = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type, byteSize: file.size }),
  });

  if (!reserved.ok) {
    throw new TransferError(
      await problemFrom(reserved, "The upload could not be started."),
      reserved.status >= 500,
    );
  }

  const { uploadUrl, storageKey } = (await reserved.json()) as {
    uploadUrl: string;
    storageKey: string;
  };

  /* The content type is inside the signature. Sending a different one, or
     letting the browser guess, is refused by the CDN rather than quietly
     stored under the wrong type. */
  const sent = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });

  if (!sent.ok) {
    /* A 403 here is very nearly always the two minutes running out on a
       slow connection, which is worth another attempt with a fresh URL. */
    throw new TransferError("The photograph did not finish sending.", true);
  }

  const registered = await fetch("/api/uploads/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      storageKey,
      contentType: file.type,
      width: shot.width,
      height: shot.height,
    }),
  });

  if (!registered.ok) {
    throw new TransferError(
      await problemFrom(registered, "The photograph could not be recorded."),
      registered.status >= 500,
    );
  }

  const { assetId } = (await registered.json()) as { assetId: string };
  return assetId;
}
