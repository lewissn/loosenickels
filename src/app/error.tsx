"use client";

import { useEffect } from "react";
import styles from "./not-found.module.css";

/**
 * A failure, stated plainly.
 *
 * The one thing worth saying to someone whose archive has just failed to
 * load is that their photographs are not the thing that broke. This page
 * says it, offers a retry, and does not apologise at length.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* Console rather than a reporting service: there is no telemetry here
       yet, and an error boundary would be a strange place to introduce it. */
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <p className={styles.code}>
          {error.digest ? `FAULT ${error.digest}` : "FAULT, UNLOGGED"}
        </p>
        <h1 className={styles.title}>This did not load.</h1>
        <p className={styles.note}>
          The fault is in the retrieving, not in the archive. Nothing has been
          lost and nothing has been changed.
        </p>
        <nav className={styles.routes}>
          <button type="button" className={styles.route} onClick={reset}>
            Try again
          </button>
          <a href="/" className={styles.route}>
            Return to the latest day
          </a>
        </nav>
      </div>
    </div>
  );
}
