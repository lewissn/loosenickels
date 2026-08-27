"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useViewTransition } from "@/lib/motion/ViewTransitions";
import { runSearch, normalise, type SearchableRecord } from "@/lib/archive/search";
import styles from "./Palette.module.css";

/* The enquiry surface searches a payload that is already in the browser
   rather than asking the server, so results appear between one keystroke
   and the next with no loading state to design around. The scoring itself
   is the shared implementation in lib/archive/search — this component does
   not have opinions about relevance. */
export type PaletteRecord = SearchableRecord;

export interface PaletteDestination {
  href: string;
  label: string;
  note?: string;
}

interface Row {
  key: string;
  href: string;
  id?: string;
  title: string;
  note?: string;
  meta: string;
  score: number;
}

export function Palette({
  records,
  destinations,
}: {
  records: PaletteRecord[];
  destinations: PaletteDestination[];
}) {
  const { navigate } = useViewTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /* Where focus was before the enquiry opened, so it can be given back. */
  const origin = useRef<HTMLElement | null>(null);

  const { rows, kind } = useMemo(() => {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      return {
        kind: "destinations" as const,
        rows: destinations.map<Row>((d, i) => ({
          key: d.href,
          href: d.href,
          title: d.label,
          note: d.note,
          meta: "",
          score: i,
        })),
      };
    }

    const matched = runSearch(records, trimmed).map<Row>((match) => ({
      key: match.record.id,
      href: `/archive/record/${match.record.slug}`,
      id: match.record.display,
      title: match.record.title,
      note: match.excerpt,
      meta: match.record.department,
      score: match.score,
    }));

    const needle = normalise(trimmed);
    const places = destinations
      .filter((d) => normalise(d.label).includes(needle))
      .map<Row>((d) => ({
        key: d.href,
        href: d.href,
        title: d.label,
        note: d.note,
        meta: "",
        score: 99,
      }));

    return { kind: "results" as const, rows: [...matched, ...places] };
  }, [destinations, query, records]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  /* Opening and closing. Cmd/Ctrl-K everywhere, and "/" when the reader is
     not already typing into something. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        origin.current = document.activeElement as HTMLElement;
        setOpen((was) => !was);
        return;
      }

      if (!open && event.key === "/" && !typing) {
        event.preventDefault();
        origin.current = document.activeElement as HTMLElement;
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const root = document.documentElement;
    const record = document.getElementById("record");

    if (open) {
      root.setAttribute("data-locked", "");
      record?.setAttribute("inert", "");

      /* Focus synchronously.

         The field cannot be focused while the panel is still computed as
         `visibility: hidden`, which is why this used to wait for an
         animation frame. But a frame is the best case: under load it is
         several, and the measured gap between pressing the shortcut and
         the caret arriving was over two hundred milliseconds. A command
         palette that drops the first thing you type is a broken command
         palette.

         Reading `offsetWidth` forces the pending style and layout to
         flush, so `data-open` has taken effect and the field is focusable
         on this tick. The frame callback stays only as a fallback for any
         engine that still refuses. */
      const field = input.current;
      if (field) {
        void field.offsetWidth;
        field.focus({ preventScroll: true });
        if (document.activeElement !== field) {
          requestAnimationFrame(() => field.focus({ preventScroll: true }));
        }
      }
    } else {
      root.removeAttribute("data-locked");
      record?.removeAttribute("inert");
      setQuery("");
      origin.current?.focus?.({ preventScroll: true });
    }

    return () => {
      root.removeAttribute("data-locked");
      record?.removeAttribute("inert");
    };
  }, [open]);

  /* Keep the selected row in view when moving through a long result set. */
  useEffect(() => {
    if (!open) return;
    const node = list.current?.querySelector<HTMLElement>('[data-selected="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [open, selected, rows]);

  const go = (href: string) => {
    setOpen(false);
    /* /random is a route handler and has to reach the server. */
    if (href === "/random") {
      window.location.href = href;
      return;
    }
    navigate(href, { kind: "into" });
  };

  const onFieldKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
      event.preventDefault();
      setSelected((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length));
      return;
    }

    if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
      event.preventDefault();
      setSelected((i) => (rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[selected];
      if (row) go(row.href);
    }
  };

  return (
    <div
      className={styles.scrim}
      data-open={open}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label="Enquiries"
    >
      <div className={styles.head}>
        <div className={styles.label}>
          <span>Enquiries</span>
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => setOpen(false)}
            tabIndex={open ? undefined : -1}
          >
            Close · Esc
          </button>
        </div>
        <input
          ref={input}
          className={styles.field}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onFieldKey}
          placeholder="Accession number, title, place…"
          aria-label="Search the archive"
          aria-controls="enquiry-results"
          aria-activedescendant={
            rows[selected] ? `enquiry-${rows[selected].key}` : undefined
          }
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          tabIndex={open ? undefined : -1}
        />
      </div>

      <div className={styles.results} ref={list} id="enquiry-results" role="listbox">
        {rows.length === 0 ? (
          <p className={styles.empty}>
            The archive holds no record answering to that.
            <span className={styles.emptyNote}>
              Accession numbers take the form LN–XX–0000.
            </span>
          </p>
        ) : (
          <div className={styles.group}>
            <p className={styles.groupLabel}>
              {kind === "destinations"
                ? "Elsewhere in the institute"
                : `${rows.length} ${rows.length === 1 ? "record" : "records"}`}
            </p>
            {rows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                id={`enquiry-${row.key}`}
                role="option"
                aria-selected={i === selected}
                className={styles.row}
                data-selected={i === selected}
                onMouseMove={() => setSelected(i)}
                onClick={() => go(row.href)}
                tabIndex={-1}
              >
                <span className={styles.rowId}>{row.id ?? "—"}</span>
                <span className={styles.rowTitle}>
                  {row.title}
                  {row.note && <span className={styles.rowNote}>{row.note}</span>}
                </span>
                <span className={styles.rowMeta}>{row.meta}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.hint} aria-hidden="true">
        <span>↑↓ Select</span>
        <span>⏎ Open</span>
        <span>Esc Close</span>
      </div>
    </div>
  );
}
