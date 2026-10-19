import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialSnapshot } from "./contracts.ts";
import { READ_TABLES, type ReadPage, type ReadTable } from "./reader.ts";

/** Internal adapter. It can only issue SELECTs to the fixed reporting whitelist.
 * Authorization and credentials belong to services/commercial-history.ts. */
export function createCommercialPageReader(client: Pick<SupabaseClient, "from">): ReadPage {
  return async <K extends ReadTable>(key: K, afterId: string | null, limit: number) => {
    const { target, columns } = READ_TABLES[key];
    let query = client.from(target).select(columns).order("id", { ascending: true }).limit(limit);
    if (afterId !== null) query = query.gt("id", afterId);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(15000));
    if (error || data === null) throw new Error("COMMERCIAL_READ_FAILED_NO_PARTIAL_REPORT");
    return data as unknown as CommercialSnapshot[K];
  };
}
