import { createHash } from "node:crypto";
import {
  canonicalHistoricalSlug,
  internalInventorySlug,
  isInternalInventory,
  type parseCompletedSale,
} from "@/lib/admin/internal-inventory";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { adjustInventoryStock } from "@/services/inventory";

const productFields = "id, name, slug, category_id, stock, status, historical_identity, web_visible, commercial_blocked";

export async function getInternalInventory(historicalSlug: string) {
  const slug = internalInventorySlug(historicalSlug);
  const db = getSupabaseAdminClient();
  const [source, inventory] = await Promise.all([
    db.from("products").select(productFields).eq("slug", canonicalHistoricalSlug(historicalSlug)).eq("historical_identity", true).maybeSingle(),
    db.from("products").select(productFields).eq("slug", slug).maybeSingle(),
  ]);
  if (source.error || inventory.error) throw new Error("No se pudo consultar el inventario interno.");
  if (!source.data) return null;
  if (inventory.data && !isInternalInventory(inventory.data)) {
    throw new Error("La ficha interna no cumple las condiciones de visibilidad y bloqueo.");
  }
  return { source: source.data, product: inventory.data, slug };
}

export async function openInternalInventory(historicalSlug: string, stock: number, adminId: string) {
  const inventory = await getInternalInventory(historicalSlug);
  if (!inventory) throw new Error("La ficha histórica no existe.");
  if (inventory.product) throw new Error("La ficha interna ya existe. Recargá para ajustar su stock.");
  const { data, error } = await getSupabaseAdminClient().from("products").insert({
    slug: inventory.slug,
    name: inventory.source.name,
    category_id: inventory.source.category_id,
    status: "draft",
    historical_identity: false,
    web_visible: false,
    commercial_blocked: true,
    short_description: "",
    price: 0,
    stock: 0,
  }).select(productFields).single();
  if (error || !data || !isInternalInventory(data)) {
    throw new Error("No se pudo abrir la ficha interna. Recargá para ver si ya existe.");
  }
  if (stock > 0) {
    try {
      await adjustInventoryStock({ productId: data.id, newStock: stock, reason: "Conteo físico inicial", createdBy: adminId });
    } catch {
      throw new Error("La ficha interna se creó. Recargá y usá «Ajustar stock» para guardar el saldo.");
    }
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function recordCompletedSale(
  historicalSlug: string,
  sale: ReturnType<typeof parseCompletedSale>,
  adminId: string,
) {
  const inventory = await getInternalInventory(historicalSlug);
  if (!inventory?.product) throw new Error("Primero abrí la ficha de inventario.");

  const db = getSupabaseAdminClient();
  const source = "Administrador · ventas realizadas";
  const batchHash = sha256(`admin-completed-sales:${adminId}`);
  const batchWrite = await db.from("historical_import_batches").upsert({
    source_file: source,
    source_sha256: batchHash,
    imported_by: adminId,
  }, { onConflict: "source_sha256", ignoreDuplicates: true });
  if (batchWrite.error) throw new Error("No se pudo preparar el registro de la venta.");
  const batch = await db.from("historical_import_batches").select("id")
    .eq("source_sha256", batchHash).eq("imported_by", adminId).single();
  if (batch.error || !batch.data) throw new Error("No se pudo verificar el origen del registro.");

  const productId = inventory.product.id;
  const { data, error } = await db.rpc("import_historical_sale", {
    p_batch_id: batch.data.id,
    p_source_sheet: "Carga manual",
    p_source_row: 1,
    p_fingerprint: sha256(`admin-completed-sale:${productId}:${sale.request.toLowerCase()}`),
    p_occurred_on: sale.date,
    p_notes: "Venta ya realizada. El saldo se administra por conteo físico.",
    p_items: [{
      product_id: productId,
      quantity: sale.quantity,
      unit_price: sale.unitPrice,
      source_total: sale.total,
    }],
  });
  if (error || typeof data?.order_id !== "string") throw new Error("No se pudo registrar la venta. Reintentá desde esta misma ficha.");
  return { orderId: data.order_id as string };
}
