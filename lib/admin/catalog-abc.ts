import type { EvidencePolicy, SaleFact } from '../commercial-reporting/contracts.ts';
import { moneyCents, sumCents } from '../commercial-reporting/money.ts';
import { commercialDate, sourceDate } from '../commercial-reporting/periods.ts';
import type { StockProduct, StockSnapshot } from './stock-health.ts';

export const ABC_WINDOW_DAYS = 90;
export const ABC_A_SHARE = 0.8;
export const ABC_B_SHARE = 0.95;
export type AbcClass = 'A' | 'B' | 'C';
export type AbcRow = {
  id: string; name: string; variant_label: string; sku: string | null; available: number;
  units: number; revenueCents: number; marginCents: number | null; cumulativeShare: number; abcClass: AbcClass;
};
export type AbcIdleRow = Pick<StockProduct,'id'|'name'|'variant_label'|'sku'|'available'> & { retainedCents: number | null };

export function abcWindow(asOf: string) {
  const to = commercialDate(asOf);
  const from = new Date(sourceDate(to)+'T12:00:00Z');
  from.setUTCDate(from.getUTCDate()+1-ABC_WINDOW_DAYS);
  return { from: from.toISOString().slice(0,10), to };
}

/** Pareto classification of the last 90 days' confirmed line revenue, plus stocked SKUs that did not sell. */
export function buildCatalogAbc(sales: readonly SaleFact[], snapshot: StockSnapshot, policy: EvidencePolicy) {
  const window = abcWindow(snapshot.asOf);
  const excludedIds = new Set(policy.excludedProductIds), excludedCategories = new Set(policy.excludedCategoryIds);
  const products = new Map<string,StockProduct>();
  for (const product of snapshot.products) {
    if (!product.id || products.has(product.id)) throw new Error('CATALOG_ABC_DUPLICATE_PRODUCT');
    if (!excludedIds.has(product.id) && !excludedCategories.has(product.category_id ?? '')) products.set(product.id, product);
  }
  type Acc = { units: number; revenueCents: number; marginCents: number | null };
  const sold = new Map<string,Acc>(), uncertain = new Set<string>();
  let uncertainSales = 0, unidentifiedLines = 0;
  for (const sale of sales) {
    if (sale.excluded || !sale.confirmed || sale.occurredOn < window.from || sale.occurredOn > window.to) continue;
    // Same evidence rules as the commercial report: unverified historical dates and unreconciled lines carry no revenue.
    if ((sale.original.historical_import && sale.dateQuality !== 'source_date') || sale.issues.includes('LINES_HEADER_NET_NOT_RECONCILED')) {
      uncertainSales++;
      for (const line of sale.lines) if (line.product_id) uncertain.add(line.product_id);
      continue;
    }
    const costs = new Map(sale.lineCosts.map(cost => [cost.lineId, cost]));
    for (const line of sale.lines) {
      if (!line.product_id || !products.has(line.product_id)) { unidentifiedLines++; continue; }
      const acc = sold.get(line.product_id) ?? { units: 0, revenueCents: 0, marginCents: 0 };
      const revenue = moneyCents(line.subtotal), cost = costs.get(line.id);
      acc.units += line.quantity;
      if (!Number.isSafeInteger(acc.units)) throw new Error('CATALOG_ABC_QUANTITY_OVERFLOW');
      acc.revenueCents = sumCents([acc.revenueCents, revenue]);
      acc.marginCents = acc.marginCents === null || cost?.evidence !== 'stored_positive_snapshot' || cost.unitCostCents === null
        ? null : sumCents([acc.marginCents, revenue - cost.unitCostCents * line.quantity]);
      sold.set(line.product_id, acc);
    }
  }
  const totalRevenueCents = sumCents([...sold.values()].map(acc => acc.revenueCents));
  let cumulative = 0;
  const rows: AbcRow[] = [...sold.entries()].filter(([, acc]) => acc.revenueCents > 0)
    .sort(([a, x], [b, y]) => y.revenueCents - x.revenueCents || y.units - x.units || a.localeCompare(b))
    .map(([id, acc]) => {
      const before = cumulative / totalRevenueCents;
      cumulative += acc.revenueCents;
      const product = products.get(id)!;
      return { id, name: product.name, variant_label: product.variant_label, sku: product.sku, available: product.available, ...acc,
        cumulativeShare: cumulative / totalRevenueCents, abcClass: before < ABC_A_SHARE ? 'A' : before < ABC_B_SHARE ? 'B' : 'C' };
    });
  const idleCandidates = [...products.values()].filter(product => product.available > 0 && !sold.has(product.id) && !uncertain.has(product.id));
  const isRecent = (product: StockProduct) => commercialDate(product.created_at) >= window.from;
  const idle: AbcIdleRow[] = idleCandidates.filter(product => !isRecent(product)).map(product => {
    const unitCost = product.cost === null ? 0 : moneyCents(product.cost);
    // A zero cost has no purchase evidence; it is not free stock.
    return { id: product.id, name: product.name, variant_label: product.variant_label, sku: product.sku, available: product.available,
      retainedCents: unitCost > 0 ? sumCents([unitCost * product.available]) : null };
  }).sort((a, b) => (a.retainedCents === null ? 1 : 0) - (b.retainedCents === null ? 1 : 0) || (b.retainedCents ?? 0) - (a.retainedCents ?? 0) || a.id.localeCompare(b.id));
  const count = (abcClass: AbcClass) => rows.filter(row => row.abcClass === abcClass).length;
  return { ...window, rows, idle, totalRevenueCents,
    counts: { A: count('A'), B: count('B'), C: count('C') },
    idleRetainedCents: sumCents(idle.flatMap(row => row.retainedCents === null ? [] : [row.retainedCents])),
    recentExcluded: idleCandidates.filter(isRecent).length, uncertainSales, unidentifiedLines };
}
export type CatalogAbc = ReturnType<typeof buildCatalogAbc>;
