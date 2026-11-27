"use server";

import { redirect } from "next/navigation";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { parsePercent } from "@/lib/admin/bulk-price";
import { BULK_FAMILY_LIMIT, familyFingerprint, planBulkFamilyPrice } from "@/lib/admin/bulk-family-price";
import { sameSelection } from "@/lib/admin/bulk-status";
import { isUuid } from "@/lib/checkout/contract";
import { revalidateAfterWrite } from "@/lib/catalog/public-catalog-revalidation";
import { readFamilyPriceRows } from "@/services/bulk-family-price";

function back(returnQuery: FormDataEntryValue | null, outcome: string): never {
  const query = new URLSearchParams(String(returnQuery ?? ""));
  // After a write the preview is not shown again, so the same percentage is never applied twice by accident.
  for (const key of outcome.startsWith("done=") ? ["done", "error", "percent"] : ["done", "error"]) query.delete(key);
  redirect(`/admin/productos/familias/precios?${query.toString()}&${outcome}`);
}
const amount = (cents: number) => (cents / 100).toFixed(2);

/** Applies a previewed family adjustment: same families and variants as read, same result; otherwise nothing. */
export async function applyBulkFamilyPrice(form: FormData) {
  await requireAdminActionSession();
  const bp = parsePercent(form.get("percent"));
  const ids = form.getAll("familyId").map(String);
  const returnQuery = form.get("returnQuery");
  if (bp === null || !ids.length || ids.length > BULK_FAMILY_LIMIT || !ids.every(isUuid)) back(returnQuery, "error=invalid");

  const client = getSupabaseAdminClient();
  const families = await readFamilyPriceRows(client, { ids }).catch(() => null);
  if (!families) back(returnQuery, "error=read");
  if (families.length !== ids.length || families.some(f => form.get(`seen-${f.id}`) !== familyFingerprint(f))) back(returnQuery, "error=changed");
  const plan = planBulkFamilyPrice(families, bp);
  if (plan.tooMany || !sameSelection(ids, plan.change.map(c => c.family.id))) back(returnQuery, "error=changed");

  const items = plan.change.map(({ family, base, variants }) => ({
    id: family.id, expected_revision: family.revision, new_base: amount(base.toCents),
    variants: variants.map(({ variant, inherits, list, special }) => ({
      id: variant.id, expected_price: variant.price, expected_override: variant.list_price_override,
      expected_transfer_price: variant.transfer_price, expected_approved_at: variant.cash_price_approved_at,
      new_override: inherits ? null : amount(list.toCents), new_transfer_price: special.approved ? amount(special.toCents) : null,
    })),
  }));
  const { data, error } = await client.rpc("bulk_adjust_family_prices", { p_items: items });
  if (error) back(returnQuery, error.message.includes("BULK_PRICE_CHANGED") ? "error=changed" : "error=write");
  revalidateAfterWrite("precios de familias en lote", ["/admin/productos/familias", ...plan.change.map(c => `/admin/productos/familias/${c.family.id}`), "/admin/productos", "/", "/mates", "/perfumes", "/buscar", "/sitemap.xml"], { publicCatalog: true });
  back(returnQuery, `done=${Number(data) || 0}`);
}
