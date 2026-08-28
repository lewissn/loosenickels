"use client";

import {
  createContext,
  startTransition,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

/* =========================================================================
   View transitions

   Navigation here is meant to read as the current interface changing
   state, not as one page being swapped for another. The View
   Transitions API is the only mechanism that can genuinely do that — it
   snapshots the old and new DOM and interpolates between them — but it
   needs to be told when a client-side navigation has finished rendering,
   which the router does not report.

   The arrangement here is:

     1. `navigate` names the source element, so the browser has something
        to pair the destination against.
     2. It opens a transition whose callback pushes the route and then
        waits on a promise.
     3. That promise is resolved by an effect watching the pathname, once
        the new route has actually painted.
     4. The name is released afterwards, so it never collides with the
        next navigation.

   Naming is transient by design. Leaving every card on an index page
   permanently named would make each navigation snapshot dozens of
   elements, most of which have no counterpart on the destination — the
   browser would animate all of them out individually and the transition
   would cost more than it is worth.
   ========================================================================= */

interface StartViewTransition {
  startViewTransition?: (callback: () => void | Promise<void>) => {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    skipTransition: () => void;
  };
}

export interface NavigateOptions {
  /**
   * The element that should stay physically continuous across the
   * navigation — a photograph, usually. It is named for the duration of
   * the transition and released afterwards.
   */
  continuity?: { element: HTMLElement | null; name: string } | null;
  /** Adds a data attribute to <html> for the duration, so CSS can respond. */
  kind?: "into" | "back" | "lateral";
  replace?: boolean;
}

interface ViewTransitionContext {
  navigate: (href: string, options?: NavigateOptions) => void;
  /** True while a transition is in flight. Used to suppress double-entry. */
  transitioning: boolean;
}

const Context = createContext<ViewTransitionContext | null>(null);

function supportsViewTransitions(): boolean {
  if (typeof document === "undefined") return false;
  if (!(document as Document & StartViewTransition).startViewTransition) return false;
  /* A transition started while the document is hidden is aborted by the
     browser as an invalid state — a background tab, a minimised window, a
     headless capture. There is nothing to animate for a reader who is not
     looking, so the navigation simply happens. */
  if (document.visibilityState !== "visible") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ViewTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [transitioning, setTransitioning] = useState(false);

  /* Resolves the transition callback once the destination has painted. */
  const pending = useRef<(() => void) | null>(null);
  /* Cleared after the transition settles, not before — removing the name
     early would drop the element out of the animation mid-flight. */
  const named = useRef<HTMLElement | null>(null);
  const settled = useRef(pathname);

  useEffect(() => {
    if (settled.current === pathname) return;
    settled.current = pathname;
    const resolve = pending.current;
    pending.current = null;
    if (resolve) {
      /* Two frames: one for React to commit, one for the browser to paint.
         Resolving earlier captures the destination mid-render. */
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }
  }, [pathname]);

  const release = useCallback(() => {
    if (named.current) {
      named.current.style.viewTransitionName = "";
      named.current = null;
    }
    document.documentElement.removeAttribute("data-transition");
    setTransitioning(false);
  }, []);

  const navigate = useCallback(
    (href: string, options: NavigateOptions = {}) => {
      const go = () => {
        if (options.replace) router.replace(href);
        else router.push(href);
      };

      if (!supportsViewTransitions()) {
        startTransition(go);
        return;
      }

      const start = (document as Document & StartViewTransition)
        .startViewTransition;
      if (!start) {
        startTransition(go);
        return;
      }

      const { continuity } = options;
      if (continuity?.element) {
        continuity.element.style.viewTransitionName = continuity.name;
        named.current = continuity.element;
      }

      document.documentElement.setAttribute(
        "data-transition",
        options.kind ?? "lateral",
      );
      setTransitioning(true);

      const transition = start.call(document, () => {
        const painted = new Promise<void>((resolve) => {
          pending.current = resolve;
        });
        startTransition(go);
        return painted;
      });

      /* Cleanup must not depend on the transition ending well.
         `finished` is the happy path and it is not guaranteed to settle:
         a transition aborted before it starts — the commonest cause is
         the document not being visible at the moment of the click —
         rejects `ready` and can leave `finished` pending forever.

         That matters more than it sounds. `data-transition` on the root
         element suppresses every reveal on the site while a navigation is
         in flight, so a single aborted transition would leave the
         attribute set and silently disable reveal animations for the rest
         of the session, with nothing visibly broken to point at.

         So: three independent releases, all idempotent. Whichever fires
         first wins and the others become no-ops. */
      let released = false;
      const finish = () => {
        if (released) return;
        released = true;
        window.clearTimeout(guard);
        /* The update callback may still be holding the transition open. */
        pending.current?.();
        pending.current = null;
        release();
      };

      const guard = window.setTimeout(finish, 3000);

      /* Aborted before it began. The DOM update still lands; there is
         simply no animation to keep the name alive for. */
      transition.ready.catch(finish);
      transition.finished.then(finish, finish);
    },
    [release, router],
  );

  /* =======================================================================
     Every internal link goes through the transition.

     The alternative — a bespoke link component used at each call site —
     was tried and is how this came to ship with the transition machinery
     fully built and connected to nothing: one component was converted,
     several dozen plain links were not, and the feature was silently
     absent from most of the site.

     Intercepting at the document means a link cannot be forgotten. Links
     that want more than a route change (a day carrying its photograph)
     call `navigate` themselves and mark the event handled; this sees
     `defaultPrevented` and stands aside.

     Everything that is not an ordinary left-click on a same-origin link
     is left completely alone: modified clicks, downloads, targeted links,
     hash links and external links all behave exactly as they would if
     none of this existed.
     ======================================================================= */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
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

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      /* Explicitly opted out — /random must reach the server to be drawn. */
      if (anchor.dataset.noTransition !== undefined) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      /* A hash on the current page is a scroll, not a navigation. */
      if (url.pathname === window.location.pathname && url.hash) return;
      if (url.href === window.location.href) return;

      event.preventDefault();
      navigate(url.pathname + url.search, { kind: "lateral" });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);

  return (
    <Context.Provider value={{ navigate, transitioning }}>
      {children}
    </Context.Provider>
  );
}

export function useViewTransition(): ViewTransitionContext {
  const context = use(Context);
  if (!context) {
    /* Outside the provider — during a static render, or in a test — fall
       back to a plain navigation rather than throwing. */
    return {
      navigate: (href) => {
        if (typeof window !== "undefined") window.location.href = href;
      },
      transitioning: false,
    };
  }
  return context;
}
