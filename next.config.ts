import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

/* Route transitions are driven directly against the View Transitions API
   rather than through a framework flag — see src/lib/motion/transition.ts.
   Doing it by hand is what makes element-level continuity possible: the
   plate being navigated to is named immediately before the navigation
   starts, and released once it has settled. */

export default config;
