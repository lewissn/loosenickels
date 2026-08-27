"use client";

import { useEffect } from "react";

export function RandomRedirect({ slugs }: { slugs: string[] }) {
  useEffect(() => {
    const slug = slugs[Math.floor(Math.random() * slugs.length)];
    window.location.replace(slug ? `/archive/record/${slug}/` : "/archive/");
  }, [slugs]);

  return <p aria-live="polite">Drawing a record from the archive…</p>;
}
