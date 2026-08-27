import Link from "next/link";
import type { Metadata } from "next";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "No such record",
};

/**
 * The archive does not apologise and does not offer a search box. It
 * states the position, in the register's own voice, and offers the two
 * things it can actually do: show the register, or draw something at
 * random.
 */
export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <p className={styles.code}>LN–00–0000</p>
        <h1 className={styles.title}>No record answering to that.</h1>
        <p className={styles.note}>
          The accession number may have been mistyped, or the record may never
          have existed. Sequences are never reused, so a number that once
          resolved will resolve again; a number that has never been issued
          will not begin to.
        </p>
        <nav className={styles.routes}>
          <Link href="/ledger" className={styles.route}>
            Consult the ledger
          </Link>
          {/* A plain anchor: /random is a route handler that redirects to
              whichever record it drew, and must reach the server. */}
          <a href="/random" className={styles.route}>
            Draw something at random
          </a>
          <Link href="/" className={styles.route}>
            Return to the entrance
          </Link>
        </nav>
      </div>
    </div>
  );
}
