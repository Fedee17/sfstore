import type { EvidencePolicy, Money, SaleFact } from '../commercial-reporting/contracts.ts';
import { moneyCents, sumCents } from '../commercial-reporting/money.ts';
import { commercialDate, sourceDate } from '../commercial-reporting/periods.ts';

export type StockProduct = {
  id: string; category_id: string | null; name: string; sku: string | null;
  family_id: string | null; variant_label: string; status: string; created_at: string;
  available: number; reserved: number; cost: Money | null;
};
export type StockSnapshot = { asOf: string; products: StockProduct[] };
export type StockHealthRow = StockProduct & {
  physical: number; soldUnits: number; soldUnits60: number; coverageDays: number | null;
  unitCostCents: number | null; retainedCents: number | null; recent: boolean;
};
export const STOCK_WINDOW_DAYS = 30;
export const STOCK_RISK_DAYS = 10;
export const STOCK_IDLE_DAYS = 60;
export const STOCK_PREVIEW_LIMIT = 5;

function shiftDay(day: string, days: number) {
  const date = new Date(sourceDate(day)+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
export function stockHealthWindow(asOf: string) {
  const to = commercialDate(asOf);
  return { from: shiftDay(to,1-STOCK_WINDOW_DAYS), idleFrom: shiftDay(to,1-STOCK_IDLE_DAYS), to };
}
function units(value: number) {
  if (!Number.isSafeInteger(value) || value<0) throw new Error('STOCK_HEALTH_INVALID_QUANTITY');
  return value;
}
export function buildStockHealth(sales: readonly SaleFact[], snapshot: StockSnapshot, policy: EvidencePolicy) {
  const window = stockHealthWindow(snapshot.asOf);
  if (snapshot.products.length>10000) throw new Error('STOCK_HEALTH_READ_LIMIT');
  const products = new Map<string,StockProduct>();
  for (const product of snapshot.products) {
    if (!product.id || products.has(product.id)) throw new Error('STOCK_HEALTH_DUPLICATE_PRODUCT');
    units(product.available); units(product.reserved); units(product.available+product.reserved);
    commercialDate(product.created_at);
    products.set(product.id,product);
  }
  const sold = new Map<string,number>(), sold60 = new Map<string,number>(), uncertainDemand=new Set<string>();
  let unverifiedHistoricalSales=0, unidentifiedLines=0;
  for (const sale of sales) {
    if (sale.excluded || !sale.confirmed || sale.occurredOn<window.idleFrom || sale.occurredOn>window.to) continue;
    if (sale.original.historical_import && sale.dateQuality!=='source_date') {
      unverifiedHistoricalSales++;
      for(const line of sale.lines) if(line.product_id && products.has(line.product_id)) uncertainDemand.add(line.product_id);
      continue;
    }
    for (const line of sale.lines) {
      if (!line.product_id || !products.has(line.product_id)) { unidentifiedLines++; continue; }
      sold60.set(line.product_id,units((sold60.get(line.product_id)??0)+units(line.quantity)));
      if (sale.occurredOn>=window.from) sold.set(line.product_id,units((sold.get(line.product_id)??0)+units(line.quantity)));
    }
  }
  const excludedIds=new Set(policy.excludedProductIds), excludedCategories=new Set(policy.excludedCategoryIds);
  const rows:StockHealthRow[]=[];
  for (const product of products.values()) {
    if (excludedIds.has(product.id) || excludedCategories.has(product.category_id??'')) continue;
    const soldUnits=sold.get(product.id)??0;
    const unitCostCents=product.cost===null?null:moneyCents(product.cost);
    // A zero cost has no purchase evidence in this projection; it is not a free asset.
    const verifiedCost=unitCostCents===0?null:unitCostCents;
    rows.push({...product,physical:product.available+product.reserved,soldUnits,soldUnits60:sold60.get(product.id)??0,
      coverageDays:soldUnits?product.available*STOCK_WINDOW_DAYS/soldUnits:null,
      unitCostCents:verifiedCost,
      retainedCents:verifiedCost===null?null:sumCents([verifiedCost*product.available]),
      recent:commercialDate(product.created_at)>=window.from});
  }
  const risk=rows.filter(row=>row.soldUnits>0 && row.coverageDays!<STOCK_RISK_DAYS)
    .sort((a,b)=>a.coverageDays!-b.coverageDays! || b.soldUnits-a.soldUnits || a.id.localeCompare(b.id));
  const idle=rows.filter(row=>row.available>0 && row.soldUnits60===0 && !row.recent && !uncertainDemand.has(row.id))
    .sort((a,b)=>(a.retainedCents===null?1:0)-(b.retainedCents===null?1:0) || (b.retainedCents??0)-(a.retainedCents??0) || a.id.localeCompare(b.id));
  return {asOf:snapshot.asOf,...window,risk,idle,
    retainedCents:sumCents(idle.flatMap(row=>row.retainedCents===null?[]:[row.retainedCents])),
    unknownCostItems:idle.filter(row=>row.retainedCents===null).length,
    recentExcluded:rows.filter(row=>row.available>0 && row.soldUnits60===0 && row.recent).length,
    uncertainExcluded:rows.filter(row=>row.available>0 && row.soldUnits60===0 && !row.recent && uncertainDemand.has(row.id)).length,
    unverifiedHistoricalSales,unidentifiedLines};
}
export type StockHealth = ReturnType<typeof buildStockHealth>;
