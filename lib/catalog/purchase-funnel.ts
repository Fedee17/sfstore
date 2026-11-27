/**
 * Purchase funnel from the store's own data. The browser reports each step at most once per tab (no cookie, no
 * identifier, no consent needed); the database keeps only a total per day and step. Orders come from `orders`.
 * Same steps as the table check in 202611290008_purchase_funnel.sql.
 */
export const FUNNEL_STEPS = ["product", "cart", "checkout"] as const;
export const FUNNEL_WINDOW_DAYS = 30;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];
export type FunnelRow = { day: string; step: string; sessions: number };
export type FunnelOrder = { payment_status: string | null };

export function parseFunnelStep(raw: unknown): FunnelStep | null {
  return typeof raw === "string" && (FUNNEL_STEPS as readonly string[]).includes(raw) ? raw as FunnelStep : null;
}

/** sendBeacon cannot carry a token: only same-origin requests count, and a stated foreign Origin always loses. */
export function isSameOriginBeacon(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

const STEP_LABELS = {
  product: "Vieron un producto",
  cart: "Agregaron al carrito",
  checkout: "Empezaron la compra",
  order: "Hicieron el pedido",
  paid: "Pagaron",
} as const;
export type FunnelSummaryStep = { key: keyof typeof STEP_LABELS; label: string; count: number; fromPrevious: number | null };

const percent = (part: number, whole: number) => whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

export function summarizeFunnel(rows: FunnelRow[], orders: FunnelOrder[]) {
  const totals: Record<FunnelStep, number> = { product: 0, cart: 0, checkout: 0 };
  const days = new Set<string>();
  for (const row of rows) {
    const step = parseFunnelStep(row.step);
    if (!step || !Number.isSafeInteger(row.sessions) || row.sessions <= 0) continue;
    totals[step] += row.sessions;
    days.add(row.day);
  }
  const counts = [totals.product, totals.cart, totals.checkout, orders.length, orders.filter(order => order.payment_status === "paid").length];
  const keys = ["product", "cart", "checkout", "order", "paid"] as const;
  const steps: FunnelSummaryStep[] = keys.map((key, index) => ({
    key, label: STEP_LABELS[key], count: counts[index], fromPrevious: index === 0 ? null : percent(counts[index], counts[index - 1]),
  }));
  return { steps, overall: percent(counts[4], counts[0]), days: days.size };
}
