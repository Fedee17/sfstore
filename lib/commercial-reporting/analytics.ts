import type { CommercialSnapshot, EvidencePolicy, SaleFact } from "./contracts.ts";
import { buildCommercialFacts, buildCommercialMonthFromFacts } from "./model.ts";
import { commercialDate, validateMonth } from "./periods.ts";
import { moneyCents, sumCents } from "./money.ts";

export function shiftCommercialMonth(month: string, offset: number): string {
  validateMonth(month);
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > 120) throw new Error("COMMERCIAL_INVALID_MONTH_OFFSET");
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + offset;
  return validateMonth(`${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`);
}
export function analyticsMonths(month: string): string[] {
  validateMonth(month);
  // Near the supported lower boundary, show only valid months.
  return Array.from({ length: 6 }, (_, i) => i - 5)
    .filter(offset => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + offset >= 1900 * 12)
    .map(offset => shiftCommercialMonth(month, offset));
}
function change(current: number, previous: number | null) {
  return { previousCents: previous, differenceCents: previous === null ? null : current - previous,
    percent: previous === null || previous === 0 ? null : (current - previous) / previous * 100 };
}
type Ranking = { key: string; name: string; quantity: number; revenueCents: number; unpricedQuantity: number };
function rankings(sales: SaleFact[], category: boolean, family = false): Ranking[] {
  const groups = new Map<string, Ranking>();
  for (const sale of sales) for (const line of sale.lines) {
    // Historical category names are snapshots. Missing product identities are NOT matched by a guessed name.
    const key = family ? (line.family_id_snapshot ? `family:${line.family_id_snapshot}` : `unclassified:${line.product_id??line.id}`) : category ? (line.category_name || "Sin categoría documentada") : (line.family_id_snapshot && line.product_id ? `variant:${line.product_id}` : line.product_id || `unidentified:${line.id}`);
    const name = family ? (line.family_name_snapshot || `Sin familia documentada — ${line.product_name}`) : category ? key : (line.product_name || "Producto sin nombre documentado");
    const row = groups.get(key) ?? { key, name, quantity: 0, revenueCents: 0, unpricedQuantity: 0 };
    row.quantity += line.quantity;
    if (!Number.isSafeInteger(row.quantity)) throw new Error("COMMERCIAL_QUANTITY_OVERFLOW");
    if (sale.issues.includes("LINES_HEADER_NET_NOT_RECONCILED")) row.unpricedQuantity += line.quantity;
    else row.revenueCents = sumCents([row.revenueCents, moneyCents(line.subtotal)]);
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => b.quantity - a.quantity || a.key.localeCompare(b.key));
}

/** Financial projection only; no database writes, current prices or current product costs. */
export function buildCommercialAnalytics(input: CommercialSnapshot, month: string, policy: EvidencePolicy, now = new Date()) {
  const months = analyticsMonths(month), facts = buildCommercialFacts(input, policy);
  const reports = months.map(m => buildCommercialMonthFromFacts(facts, m, policy));
  const report = reports[reports.length - 1], previous = reports.at(-2) ?? null;
  const confirmed = report.sales.filter(s => !s.excluded && s.confirmed);
  const costEligible = confirmed.filter(s => s.partialGrossMarginCents !== null);
  const coveredRevenueCents = sumCents(costEligible.map(s => s.revenueWithVerifiedCostCents));
  const merchandiseRevenueCents = sumCents(confirmed.map(s => Math.max(0, s.totalCents - moneyCents(s.original.shipping_cost))));
  const verifiedCostCents = sumCents(costEligible.map(s => s.verifiedCostCents));
  const channels = ["physical", "online", "other"].map(channel => {
    const selected = confirmed.filter(s => channel === "physical" ? s.origin.startsWith("physical_") : s.origin === channel);
    return { channel, orders: selected.length, amountCents: sumCents(selected.map(s => s.totalCents)) };
  });
  const currentMonth = commercialDate(now.toISOString()).slice(0, 7);
  return {
    report,
    comparison: {
      previousMonth: previous?.month ?? null,
      sales: change(report.totals.confirmedSalesCents, previous?.totals.confirmedSalesCents ?? null),
      purchases: change(report.totals.purchasesCents, previous?.totals.purchasesCents ?? null),
      selectedMonthNotClosed: month >= currentMonth,
      previousMonthNotClosed: previous !== null && previous.month >= currentMonth,
    },
    trend: reports.map(r => ({ month: r.month, confirmedSalesCents: r.totals.confirmedSalesCents,
      purchasesCents: r.totals.purchasesCents, datedReceiptsCents: r.totals.datedReceiptsCents,
      undatedApprovedForSalesCents: r.totals.undatedApprovedForSalesCents })),
    channels,
    families: rankings(confirmed, false, true), products: rankings(confirmed, false), categories: rankings(confirmed, true),
    margin: { grossMarginCents: costEligible.length ? coveredRevenueCents - verifiedCostCents : null,
      coveredRevenueCents, verifiedCostCents, merchandiseRevenueCents,
      coveragePercent: merchandiseRevenueCents > 0 ? coveredRevenueCents / merchandiseRevenueCents * 100 : null,
      unknownRevenueCents: Math.max(0, merchandiseRevenueCents - coveredRevenueCents),
      unknownCostLines: confirmed.reduce((n, s) => n + s.linesWithUnknownCost, 0),
      unreconciledSales: confirmed.filter(s => s.issues.includes("LINES_HEADER_NET_NOT_RECONCILED")).length },
    counts: { confirmed: confirmed.length,
      registered: report.sales.filter(s => !s.excluded && s.registered).length,
      historical: confirmed.filter(s => s.origin === "physical_historical").length,
      purchases: report.purchases.filter(p => !p.excluded && p.recognized).length,
      imputedPurchases: report.purchases.filter(p => !p.excluded && p.recognized && p.dateQuality === "imputed").length,
      unverifiedDates: [...report.sales.filter(s => !s.excluded), ...report.purchases.filter(p => !p.excluded && p.recognized)].filter(x => x.dateQuality === "unknown").length,
      reconciliationIssues: report.sales.filter(s => !s.excluded && s.issues.length > 0).length },
  };
}
export type CommercialAnalytics = ReturnType<typeof buildCommercialAnalytics>;
