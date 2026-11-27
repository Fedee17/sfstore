import "server-only";

import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { commercialDate } from "@/lib/commercial-reporting/periods";
import { SEARCH_DEMAND_WINDOW_DAYS, summarizeSearchDemand, type SearchDemandOutcome, type SearchDemandRow } from "@/lib/catalog/search-demand";

const PAGE = 1000;
const MAX_ROWS = 500 * SEARCH_DEMAND_WINDOW_DAYS;

/** Store side, after the response: a failure is logged by code only and never reaches the shopper. */
export async function recordSearchDemand(term: string, outcome: SearchDemandOutcome) {
  try {
    const { error } = await getSupabaseAdminClient().rpc("record_search_demand", { p_term: term, p_outcome: outcome });
    if (error) console.warn("SEARCH_DEMAND_WRITE_FAILED", error.code);
  } catch {
    console.warn("SEARCH_DEMAND_WRITE_FAILED");
  }
}

/** Informes: unmet searches of the last days. Throws on any read error (including the migration pending). */
export async function getSearchDemand() {
  await requireAdminSession();
  const client = getSupabaseAdminClient();
  const today = commercialDate(new Date().toISOString());
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - (SEARCH_DEMAND_WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  // At most 500 terms a day (database cap), read in pages so nothing is cut silently.
  const rows: SearchDemandRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from("search_demand_daily").select("day,term,outcome,searches")
      .gte("day", since).order("day").order("term").order("outcome").range(from, from + PAGE - 1);
    if (error) throw new Error("SEARCH_DEMAND_READ_FAILED");
    rows.push(...((data ?? []) as SearchDemandRow[]));
    if ((data ?? []).length < PAGE) break;
    if (rows.length > MAX_ROWS) throw new Error("SEARCH_DEMAND_TOO_MANY_ROWS");
  }
  return { since, ...summarizeSearchDemand(rows) };
}
