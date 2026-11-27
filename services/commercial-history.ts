import "server-only";

import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { COMMERCIAL_EVIDENCE } from "@/lib/commercial-reporting/evidence";
import { readCommercialMonth } from "@/lib/commercial-reporting/reader";
import { createCommercialPageReader } from "@/lib/commercial-reporting/postgrest";
import type { MonthReport } from "@/lib/commercial-reporting/contracts";
import { buildCommercialDay } from "@/lib/commercial-reporting/daily";
import { commercialDate, sourceDate } from "@/lib/commercial-reporting/periods";

export async function getCommercialDay(day = commercialDate(new Date().toISOString())) {
  sourceDate(day);
  return buildCommercialDay(await getCommercialMonth(day.slice(0, 7)), day);
}

/** No route or Server Action: authorized server consumers only.
 * Guard BEFORE constructing the privileged client. No cross-user caching. */
export async function getCommercialMonth(month: string): Promise<MonthReport> {
  await requireAdminSession();
  const client = getSupabaseAdminClient();
  return readCommercialMonth(createCommercialPageReader(client), month, COMMERCIAL_EVIDENCE);
}

/** Bounded list/detail extension: parent page first, child relations only for its IDs. */
export async function getCommercialList(options: import("@/lib/commercial-reporting/list-reader").CommercialListOptions) {
  await requireAdminSession();
  const {createCommercialScopedReader,readCommercialList}=await import("@/lib/commercial-reporting/list-reader");
  return readCommercialList(createCommercialScopedReader(getSupabaseAdminClient()),options,COMMERCIAL_EVIDENCE);
}
export async function getHistoricalCommercialRecord(kind:"sales"|"purchases",id:string) {
  const result=await getCommercialList({kind,id,origin:"historical"});
  return {sale:result.sales[0]??null,purchase:result.purchases[0]??null};
}

/** Same month contract, one paginated snapshot for selected month + comparison/trend. */
export async function getCommercialAnalytics(month: string) {
  await requireAdminSession();
  const { analyticsMonths, buildCommercialAnalytics } = await import("@/lib/commercial-reporting/analytics");
  analyticsMonths(month); // Validate before constructing a client or issuing queries.
  const { readCompleteSnapshot } = await import("@/lib/commercial-reporting/reader");
  const client = getSupabaseAdminClient();
  // Only our own uppercase error codes are shown to the admin; anything else is reported as UNKNOWN.
  const failureCode = (cause: unknown) => cause instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(cause.message) ? cause.message : "UNKNOWN";
  const stockRead = import("@/lib/admin/stock-health-reader").then(({ readStockSnapshot }) => readStockSnapshot(client))
    .then(stock => ({ stock, code: null }), cause => ({ stock: null, code: failureCode(cause) }));
  const snapshot = await readCompleteSnapshot(createCommercialPageReader(client));
  const stockResult = await stockRead;
  const analytics = buildCommercialAnalytics(snapshot, month, COMMERCIAL_EVIDENCE);
  // Catalog rotation is advisory and independent of the month: its failure must not hide the monthly report.
  let rotation = null, rotationError: string | null = stockResult.code;
  if (stockResult.stock) {
    try {
      const [{ buildCommercialFacts }, { buildCatalogAbc }] = await Promise.all([import("@/lib/commercial-reporting/model"), import("@/lib/admin/catalog-abc")]);
      rotation = buildCatalogAbc(buildCommercialFacts(snapshot, COMMERCIAL_EVIDENCE).sales, stockResult.stock, COMMERCIAL_EVIDENCE);
    } catch (cause) { rotation = null; rotationError = failureCode(cause); }
  }
  return { ...analytics, rotation, rotationError };
}

/** Days of stock per SKU for the availability screen; same sales evidence and snapshot as the sales dashboard. */
export async function getStockCoverage() {
  await requireAdminSession();
  const { readCompleteSnapshot } = await import("@/lib/commercial-reporting/reader");
  const { buildCommercialFacts } = await import("@/lib/commercial-reporting/model");
  const { buildStockHealth, stockCoverageById } = await import("@/lib/admin/stock-health");
  const { readStockSnapshot } = await import("@/lib/admin/stock-health-reader");
  const client = getSupabaseAdminClient();
  const [snapshot, stockSnapshot] = await Promise.all([readCompleteSnapshot(createCommercialPageReader(client)), readStockSnapshot(client)]);
  return stockCoverageById(buildStockHealth(buildCommercialFacts(snapshot, COMMERCIAL_EVIDENCE).sales, stockSnapshot, COMMERCIAL_EVIDENCE));
}

/** One complete read for the sales dashboard and its filtered/paginated history. */
export async function getSalesWorkspace(options: import("@/lib/commercial-reporting/list-reader").CommercialListOptions, month: string) {
  await requireAdminSession();
  const { validateMonth } = await import("@/lib/commercial-reporting/periods");
  const { normalizeListOptions } = await import("@/lib/commercial-reporting/list-reader");
  validateMonth(month); normalizeListOptions(options);
  const { readCompleteSnapshot } = await import("@/lib/commercial-reporting/reader");
  const { buildSalesWorkspace } = await import("@/lib/admin/sales-workspace");
  const client=getSupabaseAdminClient();
  const snapshot = await readCompleteSnapshot(createCommercialPageReader(client));
  const {readStockSnapshot}=await import('@/lib/admin/stock-health-reader');
  const stockSnapshot=await readStockSnapshot(client).catch(()=>undefined);
  return buildSalesWorkspace(snapshot, options, month, COMMERCIAL_EVIDENCE,stockSnapshot);
}
