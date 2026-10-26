"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

/**
 * Live `matchMedia` result. Returns `serverValue` during SSR and hydration, so markup never
 * depends on it on first paint; use CSS media queries for layout and this only for behavior.
 * Breakpoints: "(min-width: 640px)", "(min-width: 900px)", "(min-width: 1200px)".
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** True when the user asked for reduced motion. False during SSR. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

export type ScrollEdges = {
  /** The content is wider than the element. */
  overflowing: boolean;
  /**
   * Which edges hide more content, for the `.edge-fade` utility (globals.css):
   * `<div className="edge-fade" data-fade={edges.fade}>`.
   */
  fade: "start" | "end" | "both" | undefined;
};

/**
 * Tracks whether a horizontal scroller has hidden content to either side (scroll position,
 * element and content resizes), so it can show an edge fade and a "scroll for more" hint only
 * when there is more to see. Returns a callback ref for the scroller and its state:
 * `const [scrollRef, edges] = useScrollEdges()`.
 */
export function useScrollEdges(): [(element: HTMLElement | null) => void, ScrollEdges] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    if (!element) return;
    const update = () => {
      const max = element.scrollWidth - element.clientWidth;
      const start = element.scrollLeft > 1;
      const end = max - element.scrollLeft > 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    // ResizeObserver reports once on observe, which sets the initial state.
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [element]);
  return [
    setElement,
    {
      overflowing: edges.start || edges.end,
      fade: edges.start && edges.end ? "both" : edges.start ? "start" : edges.end ? "end" : undefined,
    },
  ];
}
