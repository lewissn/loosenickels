"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { observe } from "@/lib/motion/observer";
import styles from "./Reveal.module.css";

/* A layout effect on the client, a plain effect on the server, where
   there is no layout to measure and React warns about the difference. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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

  /* Anything already on screen when it mounts resolves before the first
     paint, rather than waiting for the observer.

     IntersectionObserver delivers asynchronously — a frame or two after
     the element exists. On a first load that gap is invisible. Arriving by
     a view transition it is not: the browser snapshots the destination as
     soon as it has rendered, so a page whose content is still waiting on
     an observer gets photographed empty, and every route change resolves
     to a blank page with the content appearing afterwards. Measuring
     directly in a layout effect closes that window. */
  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node || shown) return;

    const box = node.getBoundingClientRect();
    const onScreen =
      box.top < window.innerHeight && box.bottom > 0 && box.height > 0;
    if (onScreen) {
      setShown(true);
      return;
    }

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
