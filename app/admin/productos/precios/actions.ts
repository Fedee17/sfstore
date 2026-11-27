"use server";

import { redirect } from "next/navigation";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { BULK_PRICE_LIMIT, parsePercent } from "@/lib/admin/bulk-price";
import { sameSelection } from "@/lib/admin/bulk-status";
import { isUuid } from "@/lib/checkout/contract";
import { revalidateProducts } from "@/lib/catalog/public-catalog-revalidation";
import { planPriceFromRows, priceFingerprint, readPriceRows } from "@/services/bulk-price";

function back(returnQuery: FormDataEntryValue | null, outcome: string): never {
  const query = new URLSearchParams(String(returnQuery ?? ""));
  // After a write the preview is not shown again, so the same percentage is never applied twice by accident.
  for (const key of outcome.startsWith("done=") ? ["done", "error", "percent"] : ["done", "error"]) query.delete(key);
  redirect(`/admin/productos/precios?${query.toString()}&${outcome}`);
}
const amount = (cents: number) => (cents / 100).toFixed(2);

/** Applies a previewed adjustment: same products, same prices read, same result; otherwise nothing is written. */
export async function applyBulkPrice(form: FormData) {
  await requireAdminActionSession();
  const bp = parsePercent(form.get("percent"));
  const ids = form.getAll("productId").map(String);
  const returnQuery = form.get("returnQuery");
  if (bp === null || !ids.length || ids.length > BULK_PRICE_LIMIT || !ids.every(isUuid)) back(returnQuery, "error=invalid");

  const client = getSupabaseAdminClient();
  const rows = await readPriceRows(client, ids).catch(() => null);
  if (!rows) back(returnQuery, "error=read");
  if (rows.some(row => form.get(`seen-${row.id}`) !== priceFingerprint(row))) back(returnQuery, "error=changed");
  const plan = await planPriceFromRows(client, rows, bp).catch(() => null);
  if (!plan) back(returnQuery, "error=read");
  if (plan.tooMany || !sameSelection(ids, plan.change.map(change => change.row.id))) back(returnQuery, "error=changed");

  const items = plan.change.map(({ row, list, special }) => ({
    id: row.id, expected_price: row.price, expected_transfer_price: row.transfer_price, expected_approved_at: row.cash_price_approved_at,
    new_price: amount(list.toCents), new_transfer_price: special.approved ? amount(special.toCents) : null,
  }));
  const { data, error } = await client.rpc("bulk_adjust_product_prices", { p_items: items });
  if (error) back(returnQuery, error.message.includes("BULK_PRICE_CHANGED") ? "error=changed" : "error=write");
  revalidateProducts("precios en lote", plan.change.map(({ row }) => ({ productId: row.id, slug: row.slug })));
  back(returnQuery, `done=${Number(data) || 0}`);
}
