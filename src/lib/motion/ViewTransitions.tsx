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

export { plateName, titleName } from "./names";

/* =========================================================================
   View transitions

   Navigation in this archive is meant to read as the current interface
   changing state, not as one page being swapped for another. The View
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
   * navigation — a plate, usually. It is named for the duration of the
   * transition and released afterwards.
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

      /* A navigation that never completes — an aborted prefetch, a route
         that throws — must not leave the page permanently frozen under a
         transition snapshot. */
      const guard = window.setTimeout(() => {
        transition.skipTransition();
        pending.current?.();
        pending.current = null;
      }, 3000);

      transition.finished.finally(() => {
        window.clearTimeout(guard);
        release();
      });
    },
    [release, router],
  );

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
