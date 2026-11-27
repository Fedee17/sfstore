import "server-only";

import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { commercialDate } from "@/lib/commercial-reporting/periods";
import { FUNNEL_WINDOW_DAYS, summarizeFunnel, type FunnelOrder, type FunnelRow, type FunnelStep } from "@/lib/catalog/purchase-funnel";

const PAGE = 1000;
const MAX_ORDERS = 20_000;

/** Store side, after the response: a failure is logged by code only and never reaches the shopper. */
export async function recordFunnelStep(step: FunnelStep) {
  try {
    const { error } = await getSupabaseAdminClient().rpc("record_purchase_funnel_step", { p_step: step });
    if (error) console.warn("PURCHASE_FUNNEL_WRITE_FAILED", error.code);
  } catch {
    console.warn("PURCHASE_FUNNEL_WRITE_FAILED");
  }
}

/** Informes: funnel of the last days (Buenos Aires). Throws on any read error (including the migration pending). */
export async function getPurchaseFunnel() {
  await requireAdminSession();
  const client = getSupabaseAdminClient();
  const today = commercialDate(new Date().toISOString());
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - (FUNNEL_WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  // Three steps a day: one page is enough for the window.
  const { data, error } = await client.from("purchase_funnel_daily").select("day,step,sessions").gte("day", since).order("day").order("step");
  if (error) throw new Error("PURCHASE_FUNNEL_READ_FAILED");
  const orders: FunnelOrder[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("orders").select("payment_status").eq("channel", "web")
      .gte("created_at", `${since}T00:00:00-03:00`).order("created_at").order("id").range(from, from + PAGE - 1);
    if (page.error) throw new Error("PURCHASE_FUNNEL_ORDERS_READ_FAILED");
    orders.push(...((page.data ?? []) as FunnelOrder[]));
    if ((page.data ?? []).length < PAGE) break;
    if (orders.length > MAX_ORDERS) throw new Error("PURCHASE_FUNNEL_TOO_MANY_ORDERS");
  }
  return { since, ...summarizeFunnel((data ?? []) as FunnelRow[], orders) };
}
