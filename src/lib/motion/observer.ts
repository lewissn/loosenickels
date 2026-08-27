"use client";

/* =========================================================================
   A single IntersectionObserver, shared by every revealing element on the
   page.

   One observer with many targets is materially cheaper than one observer
   per element, and it guarantees that everything on a page is evaluated
   against identical thresholds — which is what makes a staggered column of
   records feel like one movement rather than several.
   ========================================================================= */

type Handler = (entry: IntersectionObserverEntry) => void;

const handlers = new WeakMap<Element, Handler>();
let observer: IntersectionObserver | null = null;

function ensure(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        handlers.get(entry.target)?.(entry);
      }
    },
    {
      /* Elements resolve slightly before their top edge reaches the fold,
         so a reveal is never the thing the reader is waiting for. */
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.01,
    },
  );
  return observer;
}

export function observe(element: Element, handler: Handler): () => void {
  handlers.set(element, handler);
  const active = ensure();
  active.observe(element);

  return () => {
    active.unobserve(element);
    handlers.delete(element);
  };
}
