"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { observe } from "@/lib/motion/observer";
import styles from "./Reveal.module.css";

type Movement = "rise" | "wipe" | "settle" | "rule";

interface RevealProps {
  children: ReactNode;
  /** Which of the four movements. Defaults to `rise`. */
  as?: Movement;
  /** Rendered element. Reveals should not introduce meaningless divs. */
  el?: ElementType;
  /** Milliseconds. Used to stagger members of a set, never as decoration. */
  delay?: number;
  /** Overrides the rise distance, for elements that sit in tight columns. */
  distance?: number;
  className?: string;
  style?: CSSProperties;
  /**
   * Data attributes are forwarded to the rendered element.
   *
   * A reveal is frequently the direct child of a grid that selects on
   * those attributes to decide how much of the page an item claims. Without
   * this the wrapper would swallow them and every layout built on the
   * content's own metadata would need an extra element to carry it.
   *
   * Typed as a pattern index signature so that only data attributes pass
   * through — this is not a general props spread.
   */
  [attribute: `data-${string}`]: unknown;
}

/**
 * Resolves its children once, when they first approach the fold.
 *
 * Deliberately one-way: elements do not un-reveal on scrolling back up.
 * Re-animating something the reader has already seen is the single most
 * common way a site with good motion starts to feel cheap.
 */
export function Reveal({
  children,
  as = "rise",
  el: Element = "div",
  delay = 0,
  distance,
  className,
  style,
  ...forwarded
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;

    /* Anything already in view at mount resolves on the next frame rather
       than waiting for a scroll that may never come. */
    return observe(node, (entry) => {
      if (entry.isIntersecting) setShown(true);
    });
  }, [shown]);

  return (
    <Element
      ref={ref}
      {...forwarded}
      className={[styles.reveal, styles[as], className].filter(Boolean).join(" ")}
      data-state={shown ? "shown" : "waiting"}
      style={
        {
          ...style,
          "--delay": `${delay}ms`,
          ...(distance === undefined ? {} : { "--distance": `${distance}px` }),
        } as CSSProperties
      }
    >
      {children}
    </Element>
  );
}
