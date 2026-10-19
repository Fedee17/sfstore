import "server-only";

import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { COMMERCIAL_EVIDENCE } from "@/lib/commercial-reporting/evidence";
import { readCommercialMonth } from "@/lib/commercial-reporting/reader";
import { createCommercialPageReader } from "@/lib/commercial-reporting/postgrest";
import type { MonthReport } from "@/lib/commercial-reporting/contracts";

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
  const snapshot = await readCompleteSnapshot(createCommercialPageReader(getSupabaseAdminClient()));
  return buildCommercialAnalytics(snapshot, month, COMMERCIAL_EVIDENCE);
}
