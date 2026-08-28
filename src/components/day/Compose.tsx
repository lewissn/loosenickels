"use client";

import { useEffect, useRef, useState } from "react";
import { ingest, type Ingested } from "@/lib/media/ingest";
import { resolveCapture } from "@/lib/archive/capture";
import { full, stamp } from "@/lib/util/calendar";
import type { CalendarDate, ResolvedDay } from "@/lib/archive/schema";
import styles from "./Compose.module.css";

/* =========================================================================
   Recording a day

   Four steps and no more: choose a photograph, see what it already knows,
   optionally write a sentence, submit.

   Everything the interface shows about the picture — the date it belongs to,
   the time it was taken, where it was, what took it — is read from the file
   rather than asked for. The user's whole job is the photograph and, if they
   feel like it, one line. That is the product.

   The date is shown, not hidden, because it is the one field the archive
   might get wrong: a file with no metadata is filed under today, and the
   person recording it is the only one who knows whether that is right.
   ========================================================================= */

interface Props {
  /** The archive owner's zone. Decides the day when a file says nothing. */
  timeZone: string;
  /** Dates already recorded, so the form can say it is replacing one. */
  existing: Set<string>;
  onRecord: (day: ResolvedDay) => void;
}

type Stage = "idle" | "reading" | "ready" | "failed";

export function Compose({ timeZone, existing, onRecord }: Props) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [shot, setShot] = useState<Ingested | null>(null);
  const [date, setDate] = useState<CalendarDate | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  /* An object URL is a live handle into the file: letting it outlive the
     preview leaks the whole image for the life of the document, and revoking
     one that is still being displayed breaks the picture.

     Both happen easily, and both happened here. A URL that has been handed to
     the archive is *adopted* — the archive is now displaying it, and this
     component must never revoke it. Anything not adopted is ours to release
     when the preview goes away. */
  const adopted = useRef(new Set<string>());

  const release = (url: string | undefined) => {
    if (url && !adopted.current.has(url)) URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const url = shot?.previewUrl;
    return () => release(url);
  }, [shot]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.setAttribute("data-locked", "");

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey, true);
    panel.current?.querySelector<HTMLElement>("button, input, textarea")?.focus();

    return () => {
      window.removeEventListener("keydown", onKey, true);
      root.removeAttribute("data-locked");
    };
  }, [open]);

  function close() {
    setOpen(false);
    discard();
    trigger.current?.focus();
  }

  /** Abandon the chosen photograph and release its handle. */
  function discard() {
    release(shot?.previewUrl);
    clear();
  }

  /** Forget the chosen photograph without touching its handle. */
  function clear() {
    setShot(null);
    setDate(null);
    setNote("");
    setStage("idle");
    setProblem(null);
  }

  async function take(file: File) {
    if (!file.type.startsWith("image/")) {
      setProblem("That is not an image.");
      setStage("failed");
      return;
    }

    setStage("reading");
    setProblem(null);

    try {
      const result = await ingest(file);
      const capture = resolveCapture({
        capturedAtLocal: result.capturedAtLocal,
        captureOffset: result.captureOffset,
        timeZone,
      });
      setShot(result);
      setDate(capture.date);
      setStage("ready");
    } catch {
      /* A file the browser cannot decode. Say so plainly and let them try
         another; nothing has been lost. */
      setProblem("This image could not be read. Try another.");
      setStage("failed");
    }
  }

  function submit() {
    if (!shot || !date) return;

    const capture = resolveCapture({
      capturedAtLocal: shot.capturedAtLocal,
      captureOffset: shot.captureOffset,
      timeZone,
    });

    /* The shape handed on is deliberately the shape ArchiveSource.submit
       will take. When there is a database and object storage behind this,
       the change is that the file goes to storage and this object goes to
       the server — not that the flow is rewritten. */
    onRecord({
      date,
      note: note.trim() || undefined,
      visibility: "private",
      photo: {
        assetId: `local-${shot.checksum.slice(0, 16)}` as ResolvedDay["photo"]["assetId"],
        width: shot.width,
        height: shot.height,
        placeholder: shot.placeholder,
        lightness: shot.lightness,
        tone: shot.tone,
        processing: "ready",
        urls: {
          thumb: shot.previewUrl,
          medium: shot.previewUrl,
          large: shot.previewUrl,
        },
        alt: `Photograph recorded for ${full(date)}.`,
      },
      capturedAt: capture.capturedAt,
      captureTimeZone: capture.captureTimeZone,
      ...(shot.coordinates
        ? { place: { coordinates: shot.coordinates } }
        : {}),
      ...(shot.camera ? { camera: shot.camera } : {}),
      revisionCount: 1,
    });

    /* The archive is displaying this image now, so the handle is no longer
       ours to release. Clearing the form must not take the picture with it. */
    adopted.current.add(shot.previewUrl);
    clear();
    setOpen(false);
  }

  const replacing = date ? existing.has(date) : false;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
      >
        Record a day
      </button>

      {open && (
        <div className={styles.layer} role="dialog" aria-modal="true" aria-label="Record a day">
          <div className={styles.panel} ref={panel}>
            <button type="button" className={styles.close} onClick={close}>
              Close
            </button>

            <input
              ref={input}
              type="file"
              accept="image/*"
              className={styles.file}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void take(file);
                /* Cleared so choosing the same file twice still fires. */
                e.target.value = "";
              }}
            />

            {stage !== "ready" && (
              <div
                className={styles.well}
                data-busy={stage === "reading" ? "" : undefined}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) void take(file);
                }}
              >
                <button
                  type="button"
                  className={styles.choose}
                  onClick={() => input.current?.click()}
                  disabled={stage === "reading"}
                >
                  {stage === "reading" ? "Reading" : "Choose a photograph"}
                </button>
                <p className={styles.hint}>or drop one here</p>
                {problem && <p className={styles.problem}>{problem}</p>}
              </div>
            )}

            {stage === "ready" && shot && date && (
              <div className={styles.review}>
                <figure className={styles.preview}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot.previewUrl} alt="" width={shot.width} height={shot.height} />
                </figure>

                <div className={styles.detail}>
                  <p className={styles.date}>{full(date)}</p>

                  {/* Read from the file, stated rather than labelled. */}
                  <p className={styles.derived}>
                    <span>{shot.width} × {shot.height}</span>
                    {shot.camera?.model && <span>{shot.camera.model}</span>}
                    {shot.coordinates && (
                      <span>
                        {shot.coordinates.lat.toFixed(3)}, {shot.coordinates.lon.toFixed(3)}
                      </span>
                    )}
                  </p>

                  {!shot.capturedAtLocal && (
                    <p className={styles.caution}>
                      This file records no capture date, so it has been filed
                      under today.
                    </p>
                  )}

                  {replacing && (
                    <p className={styles.caution}>
                      {stamp(date)} already has a photograph. This will become
                      the current one; the earlier is kept.
                    </p>
                  )}

                  <label className={styles.noteField}>
                    <span className={styles.noteLabel}>A line, if you want one</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={280}
                    />
                  </label>

                  <div className={styles.actions}>
                    <button type="button" className={styles.submit} onClick={submit}>
                      {replacing ? "Replace photograph" : "Record this day"}
                    </button>
                    <button type="button" className={styles.again} onClick={discard}>
                      Choose another
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
