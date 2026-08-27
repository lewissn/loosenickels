"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the user's motion preference, and keeps tracking it — the setting
 * can change mid-session and the interface should follow without a reload.
 *
 * Returns false during server render and first paint so that markup is
 * stable; anything that must be correct before the first frame should use
 * the CSS media query instead, which has no such gap.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
