import type { FunnelStep } from "./purchase-funnel";

const KEY = "sfstore-funnel-v1:";

/**
 * Counts a funnel step once per browser tab: the mark lives in sessionStorage and is never sent. The beacon carries
 * only the step name; any failure (storage blocked, no beacon) silently skips the count and never affects the shop.
 */
export function countFunnelStep(step: FunnelStep) {
  try {
    if (window.sessionStorage.getItem(KEY + step)) return;
    if (!navigator.sendBeacon("/api/embudo", step)) return;
    window.sessionStorage.setItem(KEY + step, "1");
  } catch { /* Counting is optional. */ }
}
