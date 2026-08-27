"use client";

import { useEffect } from "react";
import styles from "./not-found.module.css";

/**
 * The institution's account of its own failure.
 *
 * Written in the same register as everything else — no apology, no
 * exclamation mark, no cartoon. It states what happened, offers the one
 * thing it can actually do, and does not pretend the reader is at fault.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* Console rather than a reporting service: there is no telemetry on
       this site and adding some in an error boundary would be a strange
       place to start. */
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <p className={styles.code}>
          {error.digest ? `FAULT ${error.digest}` : "FAULT, UNLOGGED"}
        </p>
        <h1 className={styles.title}>Something in the stacks has given way.</h1>
        <p className={styles.note}>
          The record may exist and may be perfectly sound; the fault is in
          the retrieving of it. Nothing has been lost — the archive keeps no
          state that a failed page could damage.
        </p>
        <nav className={styles.routes}>
          <button type="button" className={styles.route} onClick={reset}>
            Try again
          </button>
          <a href="/ledger" className={styles.route}>
            Consult the ledger
          </a>
          <a href="/" className={styles.route}>
            Return to the entrance
          </a>
        </nav>
      </div>
    </div>
  );
}
