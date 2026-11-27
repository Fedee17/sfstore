"use server";

import { redirect } from "next/navigation";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { BULK_STATUS_LIMIT, parseBulkTarget, sameSelection, type BulkStatusRow } from "@/lib/admin/bulk-status";
import { isUuid } from "@/lib/checkout/contract";
import { revalidateProducts } from "@/lib/catalog/public-catalog-revalidation";
import { planFromRows } from "@/services/bulk-status";

function back(returnQuery: FormDataEntryValue | null, outcome: string): never {
  const query = new URLSearchParams(String(returnQuery ?? ""));
  for (const key of ["done", "of", "error"]) query.delete(key);
  redirect(`/admin/productos/masivo?${query.toString()}&${outcome}`);
}

/** Applies a previewed status change. Re-reads and re-plans; any difference with the preview aborts the write. */
export async function applyBulkStatus(form: FormData) {
  await requireAdminActionSession();
  const target = parseBulkTarget(form.get("target"));
  const ids = form.getAll("productId").map(String);
  const returnQuery = form.get("returnQuery");
  if (!target || !ids.length || ids.length > BULK_STATUS_LIMIT || !ids.every(isUuid)) back(returnQuery, "error=invalid");

  const client = getSupabaseAdminClient();
  const { data, error } = await client.from("products").select("id,name,sku,slug,status,historical_identity").in("id", ids);
  if (error) back(returnQuery, "error=read");
  const plan = await planFromRows(client, (data ?? []) as BulkStatusRow[], target).catch(() => null);
  if (!plan) back(returnQuery, "error=read");
  if (plan.tooMany || !sameSelection(ids, plan.change.map(row => row.id))) back(returnQuery, "error=changed");

  // One atomic statement; its guards repeat the plan. A row changed meanwhile is left out and shows in the count.
  const { data: written, error: writeError } = await client.from("products")
    .update({ status: target })
    .in("id", ids)
    .eq("historical_identity", false)
    .neq("status", target)
    .select("id,slug");
  if (writeError) back(returnQuery, "error=write");
  revalidateProducts("estado en lote", (written ?? []).map(row => ({ productId: row.id, slug: row.slug })));
  back(returnQuery, `done=${(written ?? []).length}&of=${ids.length}`);
}
