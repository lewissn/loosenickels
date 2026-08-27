"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DepartmentCode } from "@/lib/archive";
import styles from "./Palette.module.css";

export interface PaletteRecord {
  id: string;
  /** Accession number in display form. */
  display: string;
  dept: DepartmentCode;
  department: string;
  slug: string;
  title: string;
  summary?: string;
  place?: string;
  collections: string[];
  date: string;
}

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

function normalise(value: string): string {
  return value.toLowerCase().replace(/[–—]/g, "-");
}

/* Fields are weighted rather than concatenated. An accession number typed
   in full always wins; a title beats a place; a place beats a tag. Ordering
   results by where the match occurred is the difference between a search
   that feels considered and one that feels like a filter. */
function scoreRecord(record: PaletteRecord, needle: string): Row | null {
  const row = (score: number, note?: string): Row => ({
    key: record.id,
    href: `/archive/record/${record.slug}`,
    id: record.display,
    title: record.title,
    note,
    meta: record.department,
    score,
  });

  const id = normalise(record.id);
  if (id.includes(needle)) return row(id.startsWith(needle) ? 0 : 1, record.summary);

  const title = normalise(record.title);
  if (title.startsWith(needle)) return row(2, record.summary);
  if (title.includes(needle)) return row(3, record.summary);

  if (record.place && normalise(record.place).includes(needle)) {
    return row(4, record.place);
  }

  if (normalise(record.department).includes(needle)) {
    return row(5, record.summary);
  }

  const collection = record.collections.find((c) => normalise(c).includes(needle));
  if (collection) return row(6, collection.replace(/-/g, " "));

  if (record.summary && normalise(record.summary).includes(needle)) {
    return row(7, record.summary);
  }

  return null;
}

export function Palette({
  records,
  destinations,
}: {
  records: PaletteRecord[];
  destinations: PaletteDestination[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /* Where focus was before the enquiry opened, so it can be given back. */
  const origin = useRef<HTMLElement | null>(null);

  const { rows, kind } = useMemo(() => {
    const needle = normalise(query.trim());

    if (needle.length === 0) {
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

    const matched = records
      .map((record) => scoreRecord(record, needle))
      .filter((row): row is Row => row !== null)
      .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
      .slice(0, 12);

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
      /* Focus after paint, so the field is genuinely on screen first. */
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
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
    router.push(href);
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
