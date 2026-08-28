import Link from "next/link";
import type { Metadata } from "next";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "No such day",
};

/**
 * Written in the product's register: it states the position, offers the one
 * thing it can actually do, and does not suggest the reader is at fault.
 */
export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <h1 className={styles.title}>Nothing was recorded here.</h1>
        <p className={styles.note}>
          Either that day has no photograph, or it is private. A day with
          nothing in it is not an error — most archives have them, and they
          are part of the record.
        </p>
        <nav className={styles.routes}>
          <Link href="/" className={styles.route}>
            Return to the latest day
          </Link>
        </nav>
      </div>
    </div>
  );
}
