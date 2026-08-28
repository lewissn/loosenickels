"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./Menu.module.css";

/* =========================================================================
   Menu

   Not a nav bar. Opening it takes the viewport: the photograph behind
   recedes and dims, and the destinations enter as typography, one after
   another, at a scale that makes choosing where to go feel like part of the
   product rather than an administrative act.

   The destinations are the whole information architecture, and it is
   deliberately small. If this list ever needs a second column, something has
   gone wrong with the product.

   Most of them do not exist yet. They are listed anyway, and marked, because
   an honest empty room is better than a menu that pretends to be full — and
   because the shape of the architecture is a design decision worth being
   able to look at now.
   ========================================================================= */

interface Destination {
  label: string;
  href: string;
  /** One line, in the product's register. Shown on hover and on focus. */
  note: string;
  ready: boolean;
}

const DESTINATIONS: Destination[] = [
  { label: "Latest", href: "/today", note: "The most recent day recorded.", ready: true },
  { label: "Timeline", href: "/timeline", note: "Days, months and years at one scale or another.", ready: false },
  { label: "Calendar", href: "/calendar", note: "A whole year as a field of photographs.", ready: false },
  { label: "Map", href: "/map", note: "Where the days happened.", ready: false },
  { label: "On this day", href: "/on-this-day", note: "The same date, in every year that has one.", ready: false },
  { label: "Profile", href: "/profile", note: "Identity, privacy and what is public.", ready: false },
];

interface Props {
  /** The signed-in reader's address. Omitted where nobody is signed in —
      the menu then carries destinations only. */
  account?: string;
}

export function Menu({ account }: Props = {}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  /* The menu hangs over whatever photograph is on screen, so it takes that
     photograph's environment rather than the document's. Read from the
     viewport surface on open instead of duplicating the lightness rule. */
  const [env, setEnv] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  /* Escape closes, and focus returns to the control that opened it. Focus is
     trapped while open, and the page behind is made inert, so nothing under
     the layer can be tabbed into. */
  useEffect(() => {
    if (!open) return;

    setEnv(
      document
        .querySelector("[data-viewport-surface]")
        ?.getAttribute("data-env") ?? null,
    );

    const root = document.documentElement;
    root.setAttribute("data-locked", "");

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
        return;
      }

      if (e.key !== "Tab" || !panel.current) return;

      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    /* Capture, so the viewer's own arrow-key navigation never runs while the
       menu is the thing being navigated. */
    window.addEventListener("keydown", onKey, true);
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();

    return () => {
      window.removeEventListener("keydown", onKey, true);
      root.removeAttribute("data-locked");
    };
  }, [open]);

  /* `inert` is set on the element rather than passed as a prop.

     React serialises a true boolean attribute to inert="" and then warns
     about reading that same string back during hydration, so the prop form
     produces a console error for an attribute React itself wrote. Setting it
     here keeps the behaviour and drops the warning.

     Nothing depends on this for correctness before hydration: the panel is
     `visibility: hidden` while closed, and hidden elements are already out of
     the tab order. This is the second lock, not the only one. */
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.triggerRule} aria-hidden="true" />
        {open ? "Close" : "Menu"}
      </button>

      <div
        id={id}
        ref={panel}
        className={styles.panel}
        data-open={open ? "" : undefined}
        data-env={env ?? undefined}
        aria-hidden={open ? undefined : true}
      >
        <nav className={styles.nav} aria-label="Sections">
          <ul className={styles.list}>
            {DESTINATIONS.map((d, i) => (
              <li
                key={d.label}
                className={styles.item}
                /* The stagger is an index, not a hand-written delay per row,
                   so adding a destination cannot forget to be animated. */
                style={{ "--i": i } as React.CSSProperties}
                data-dim={hovered !== null && hovered !== i ? "" : undefined}
                onPointerEnter={() => setHovered(i)}
                onPointerLeave={() => setHovered(null)}
              >
                {d.ready ? (
                  <a
                    href={d.href}
                    className={styles.link}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                  >
                    <span className={styles.label}>{d.label}</span>
                    <span className={styles.note}>{d.note}</span>
                  </a>
                ) : (
                  /* Not a disabled link. A destination that does not exist is
                     not a thing you are forbidden from reaching — it is a
                     thing that has not been built, and saying so plainly is
                     the register this product uses. */
                  <span className={styles.link} data-unbuilt="">
                    <span className={styles.label}>{d.label}</span>
                    <span className={styles.note}>
                      {d.note}
                      <span className={styles.pending}>Not yet built</span>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {account ? (
          <div className={styles.account}>
            <span className={styles.who}>{account}</span>
            <form action="/auth/sign-out" method="post">
              <button className={styles.leave} type="submit">
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </>
  );
}
