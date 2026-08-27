"use client";

import { useEffect } from "react";

/**
 * Puts the institution into darkness for as long as a record is open, and
 * restores whatever state it was in on the way out.
 *
 * Used by the Sounds department. A recording of rain on polythene, or of a
 * lathe running down, is not improved by being read off a sheet of paper
 * in daylight — so the archive dims, and then puts the lights back on
 * behind you.
 *
 * A reader who has explicitly chosen daylight gets it back on leaving. A
 * reader who is already after dark notices nothing, which is correct.
 */
export function Nightfall() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-light");

    root.setAttribute("data-light", "dark");

    return () => {
      if (previous === null) root.removeAttribute("data-light");
      else root.setAttribute("data-light", previous);
    };
  }, []);

  return null;
}
