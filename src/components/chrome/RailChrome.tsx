"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { DepartmentCode } from "@/lib/archive/schema";
import { IndexLayer } from "./IndexLayer";
import styles from "./Rail.module.css";

export interface IndexDepartment {
  code: DepartmentCode;
  name: string;
  slug: string;
  charter: string;
  count: number;
}

interface RailChromeProps {
  departments: IndexDepartment[];
  holdings: number;
  collections: number;
  placed: number;
}

export function RailChrome({
  departments,
  holdings,
  collections,
  placed,
}: RailChromeProps) {
  const [indexOpen, setIndexOpen] = useState(false);
  const pathname = usePathname();

  /* Any navigation closes the layer. Leaving it open across a route change
     would strand the reader on a page they cannot see. */
  useEffect(() => {
    setIndexOpen(false);
  }, [pathname]);

  /* The layer scales the page behind it, which CSS handles via <html>. */
  useEffect(() => {
    const root = document.documentElement;
    if (indexOpen) {
      root.setAttribute("data-index", "open");
      root.setAttribute("data-locked", "");
    } else {
      root.removeAttribute("data-index");
      root.removeAttribute("data-locked");
    }
    return () => {
      root.removeAttribute("data-index");
      root.removeAttribute("data-locked");
    };
  }, [indexOpen]);

  /* Keyboard commands. Not documented in the interface — they are listed
     on the colophon, for anyone who goes looking. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (event.key === "Escape" && indexOpen) {
        event.preventDefault();
        setIndexOpen(false);
        return;
      }

      if (event.key === "i" || event.key === "I") {
        event.preventDefault();
        setIndexOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [indexOpen]);

  const toggle = useCallback(() => setIndexOpen((open) => !open), []);

  return (
    <>
      <header className={styles.rail}>
        <Link href="/" className={styles.mark} aria-label="Loose Nickels, home">
          <span className={styles.stamp} aria-hidden="true">
            LN
          </span>
          <span className={styles.wordmark}>
            <span className={styles.name}>Loose Nickels</span>
            <span className={styles.qualifier}>Independent Archive · Est. 2026</span>
          </span>
        </Link>

        <nav className={styles.controls} aria-label="Institutional">
          <span className={styles.holdings}>
            {String(holdings).padStart(4, "0")} records
          </span>

          <a href="/random" className={styles.control} data-secondary="true">
            Random
          </a>

          <button
            type="button"
            className={styles.control}
            onClick={toggle}
            aria-expanded={indexOpen}
            aria-controls="index-layer"
          >
            {indexOpen ? "Close" : "Index"}
            <span className={styles.chord} aria-hidden="true">
              I
            </span>
          </button>
        </nav>
      </header>

      <IndexLayer
        open={indexOpen}
        onClose={() => setIndexOpen(false)}
        departments={departments}
        collections={collections}
        placed={placed}
        holdings={holdings}
      />
    </>
  );
}
