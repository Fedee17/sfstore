"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(update: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}

/** Live `prefers-reduced-motion` (true on the server, so nothing rotates before hydration). */
function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeToReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => true);
}

/**
 * Shared automatic rotation for the Home carousels: advances every `interval` ms while `active`,
 * never with reduced motion, and waits while the tab is hidden.
 */
export function useCarouselRotation(active: boolean, advance: () => void, interval = 4000) {
  const reducedMotion = usePrefersReducedMotion();
  const latestAdvance = useRef(advance);

  useEffect(() => {
    latestAdvance.current = advance;
  });

  const running = active && !reducedMotion;

  useEffect(() => {
    if (!running) return;

    function schedule() {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        latestAdvance.current();
        schedule();
      }, interval);
    }

    let timer: number;
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [running, interval]);

  return running;
}
