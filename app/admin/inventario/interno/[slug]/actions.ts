"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminActionSession } from "@/lib/admin-session";
import { canonicalHistoricalSlug, parseCompletedSale } from "@/lib/admin/internal-inventory";
import { openInternalInventory, recordCompletedSale } from "@/services/internal-inventory";

type Result = { error?: string; orderId?: string };

export async function saveInternalInventory(slug: string, _state: Result, form: FormData): Promise<Result> {
  const href = `/admin/inventario/interno/${encodeURIComponent(canonicalHistoricalSlug(slug))}`;
  try {
    const admin = await requireAdminActionSession();
    const value = String(form.get("stock") ?? "").trim();
    const stock = Number(value);
    if (!/^\d+$/.test(value) || stock > 2147483647) {
      throw new Error("Ingresá un saldo entero mayor o igual a cero.");
    }
    await openInternalInventory(slug, stock, admin.id);
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/productos");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar el saldo." };
  }
  redirect(href);
}

export async function saveCompletedSale(slug: string, _state: Result, form: FormData): Promise<Result> {
  try {
    const admin = await requireAdminActionSession();
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format();
    const sale = parseCompletedSale(form, today);
    const result = await recordCompletedSale(slug, sale, admin.id);
    revalidatePath("/admin/ventas");
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la venta." };
  }
}
