"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useViewTransition } from "@/lib/motion/ViewTransitions";
import { plateName } from "@/lib/motion/names";

interface RecordLinkProps {
  href: string;
  /** Accession number. Both ends of the transition derive the name from it. */
  id: string;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}

/**
 * A link into a record that carries the record's plate with it.
 *
 * On activation this finds the plate inside the card it belongs to, names
 * it, and hands that name to the transition. The destination's hero holds
 * the same name, so the browser has a pair to interpolate between and the
 * plate travels — expanding from a thumbnail in an index into the hero of
 * the record — rather than one page fading out and another fading in.
 *
 * The name is applied here, per navigation, rather than sitting on every
 * card permanently. An index of twenty-six named elements would make the
 * browser snapshot and animate all twenty-six on every navigation, only
 * one of which has a counterpart on the destination.
 *
 * Modified clicks are left entirely alone: a middle-click, or a
 * cmd-click, must open a tab, and an anchor that has been turned into a
 * button is a worse link than the one it replaced.
 */
export function RecordLink({
  href,
  id,
  className,
  children,
  ...rest
}: RecordLinkProps) {
  const anchor = useRef<HTMLAnchorElement>(null);
  const { navigate } = useViewTransition();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    /* The plate may be several elements away — the link sits in the
       caption, the plate sits in the frame above it — so the search goes
       up to the card and back down. */
    const card = anchor.current?.closest("[data-record]");
    const plate = card?.querySelector<HTMLElement>("[data-plate]") ?? null;

    navigate(href, {
      continuity: plate ? { element: plate, name: plateName(id) } : null,
      kind: "into",
    });
  };

  return (
    <Link ref={anchor} href={href} className={className} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
