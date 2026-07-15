"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { requireAdminActionSession } from "@/lib/admin-session";
import { decreaseStockForOrder } from "@/services/inventory";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "paid",
  "preparing",
  "shipped",
  "completed",
  "cancelled",
] as const;

const PAYMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "refunded",
] as const;

export async function updateOrderState(formData: FormData) {
  await requireAdminActionSession();

  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  const paymentStatus = String(formData.get("paymentStatus") ?? "");

  if (!orderId) {
    throw new Error("Falta el ID de la orden.");
  }

  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    throw new Error("Estado de pedido invalido.");
  }

  if (
    !PAYMENT_STATUSES.includes(
      paymentStatus as (typeof PAYMENT_STATUSES)[number],
    )
  ) {
    throw new Error("Estado de pago invalido.");
  }

  const supabase = getSupabaseAdminClient();
  const { data: previousOrder, error: previousOrderError } = await supabase
    .from("orders")
    .select("status, payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (previousOrderError) {
    throw new Error(previousOrderError.message);
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status,
      payment_status: paymentStatus,
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(error.message);
  }

  const paymentApprovedChanged =
    paymentStatus === "approved" &&
    previousOrder?.payment_status !== "approved";
  const statusConfirmedOrPaidChanged =
    (status === "confirmed" || status === "paid") &&
    previousOrder?.status !== status;

  if (paymentApprovedChanged || statusConfirmedOrPaidChanged) {
    const stockResult = await decreaseStockForOrder(orderId);

    if (!stockResult.success) {
      console.warn("[admin] No se pudo descontar stock para la orden", {
        orderId,
        error: stockResult.error,
      });
      throw new Error(`Pedido actualizado, pero no se pudo descontar stock: ${stockResult.error}`);
    }

    console.info("[admin] Resultado de descuento de stock", {
      orderId,
      ...stockResult,
    });
  }

  revalidatePath("/admin/pedidos");
  redirect("/admin/pedidos");
}
