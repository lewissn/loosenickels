"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plate } from "@/components/plate/Plate";
import type { IndexDepartment } from "./RailChrome";
import styles from "./IndexLayer.module.css";

interface IndexLayerProps {
  open: boolean;
  onClose: () => void;
  departments: IndexDepartment[];
  holdings: number;
  collections: number;
  placed: number;
}

const SECONDARY = [
  { href: "/archive", label: "The Archive" },
  { href: "/collections", label: "Collections" },
  { href: "/places", label: "Survey Plot" },
  { href: "/research", label: "Research" },
  { href: "/ledger", label: "Ledger" },
  { href: "/about", label: "About" },
] as const;

export function IndexLayer({
  open,
  onClose,
  departments,
  holdings,
  collections,
  placed,
}: IndexLayerProps) {
  const layer = useRef<HTMLDivElement>(null);
  const [pointing, setPointing] = useState<string | null>(null);
  /* Plates are not drawn until the layer has been opened once. Eight
     canvases rendering behind a hidden panel on every page load would be
     work done for nothing. */
  const [everOpened, setEverOpened] = useState(false);
  const [light, setLight] = useState<"day" | "dark">("day");

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  useEffect(() => {
    setLight(
      document.documentElement.getAttribute("data-light") === "dark"
        ? "dark"
        : "day",
    );
  }, [open]);

  /* While the layer owns the viewport, the page behind it is genuinely
     unreachable — not merely covered. */
  useEffect(() => {
    const record = document.getElementById("record");
    if (!record) return;
    if (open) record.setAttribute("inert", "");
    else record.removeAttribute("inert");
    return () => record.removeAttribute("inert");
  }, [open]);

  /* Focus enters the layer on open and is kept inside it while it is up. */
  useEffect(() => {
    if (!open) {
      setPointing(null);
      return;
    }

    const node = layer.current;
    if (!node) return;

    const first = node.querySelector<HTMLElement>("a, button");
    first?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [open]);

  const toggleLight = () => {
    const next = light === "dark" ? "day" : "dark";
    const root = document.documentElement;
    if (next === "dark") root.setAttribute("data-light", "dark");
    else root.removeAttribute("data-light");
    root.setAttribute("data-light-mode", "held");
    try {
      localStorage.setItem("ln-light", next);
    } catch {
      /* Storage unavailable. The choice simply does not persist. */
    }
    setLight(next);
  };

  const active = departments.find((d) => d.code === pointing) ?? null;

  return (
    <div
      ref={layer}
      id="index-layer"
      className={styles.layer}
      data-open={open}
      data-pointing={Boolean(active)}
      data-dept={active?.code}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label="Index"
      onMouseLeave={() => setPointing(null)}
    >
      <div className={styles.body}>
        <div>
          <h2 className={styles.heading}>Departments</h2>
          <nav
            className={styles.departments}
            data-pointing={Boolean(active)}
            aria-label="Departments"
          >
            {departments.map((department, i) => (
              <Link
                key={department.code}
                href={`/archive/${department.slug}`}
                className={styles.department}
                data-active={pointing === department.code}
                onMouseEnter={() => setPointing(department.code)}
                onFocus={() => setPointing(department.code)}
                tabIndex={open ? undefined : -1}
              >
                <span className={styles.ordinal} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={styles.label}>{department.name}</span>
                <span className={styles.tally}>
                  {String(department.count).padStart(3, "0")}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <div className={styles.preview} aria-hidden="true">
          <div className={styles.previewPlate}>
            {everOpened &&
              departments.map((department) => (
                <div
                  key={department.code}
                  data-showing={pointing === department.code}
                >
                  {/* Sequence 0000 is reserved: it is the department's own
                      plate rather than any individual record's. */}
                  <Plate id={`LN-${department.code}-0000`} dept={department.code} />
                </div>
              ))}
          </div>
          <p className={styles.charter} data-showing={Boolean(active)}>
            {active?.charter}
          </p>
        </div>
      </div>

      <div className={styles.foot}>
        <nav className={styles.secondary} aria-label="Elsewhere">
          {SECONDARY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.secondaryLink}
              tabIndex={open ? undefined : -1}
            >
              {item.label}
            </Link>
          ))}
          <a
            href="/random"
            className={styles.secondaryLink}
            tabIndex={open ? undefined : -1}
          >
            Random Record
          </a>
        </nav>

        <div className={styles.readout}>
          <span>
            {String(holdings).padStart(4, "0")} records · {collections} collections ·{" "}
            {placed} placed
          </span>
          <button
            type="button"
            className={styles.lightControl}
            onClick={toggleLight}
            tabIndex={open ? undefined : -1}
          >
            {light === "dark" ? "After dark" : "Daylight"}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="sr"
        onClick={onClose}
        tabIndex={open ? undefined : -1}
      >
        Close index
      </button>
    </div>
  );
}
