"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { getAnalytics, track } from "@/lib/analytics/client";
import { countFunnelStep } from "@/lib/catalog/purchase-funnel-client";

const funnelSteps = { view_item: "product", begin_checkout: "checkout" } as const;

// Views are counted when the existing content is actually visible, not prefetched.
export function AnalyticsView({ event, params, identity }: { event: "view_item" | "view_item_list" | "catalog_search" | "begin_checkout"; params: Record<string, unknown>; identity: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const analytics = getAnalytics();
  const revision = useSyncExternalStore(analytics.subscribe, analytics.snapshot, () => 0);
  const serialized = JSON.stringify(params);
  // Own funnel: one anonymous count per tab, no identifier, so it does not wait for the analytics consent.
  useEffect(() => {
    if (event === "view_item" || event === "begin_checkout") countFunnelStep(funnelSteps[event]);
  }, [event]);
  useEffect(() => {
    if (!analytics.active() || !marker.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        track(event, JSON.parse(serialized), `${event}:${identity}`);
        observer.disconnect();
      }
    });
    observer.observe(marker.current);
    return () => observer.disconnect();
  }, [analytics, event, identity, serialized, revision]);
  return <span ref={marker} aria-hidden="true" className="pointer-events-none absolute h-px w-px" />;
}
