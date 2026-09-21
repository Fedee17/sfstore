"use server";

import { revalidatePath } from "next/cache";

import { requireAdminActionSession } from "@/lib/admin-session";
import {
  CUSTOMER_ORDER_STATUSES,
  validateCustomerOrderItems,
  type CustomerOrderStatus,
} from "@/lib/orders/workflow";
import { ORDER_PAYMENT_METHODS, type OrderPaymentMethod } from "@/services/order-payments";
import {
  addCustomerOrderPayment,
  deliverCustomerOrder,
  saveCustomerOrder,
  transitionCustomerOrder,
} from "@/services/customer-orders";

export type CustomerOrderActionState = {
  status: "idle" | "success" | "error";
  message: string;
  orderId?: string;
};

function amount(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(parsed)) throw new Error("El importe no es valido.");
  return parsed;
}

function readItems(formData: FormData) {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(Number);
  const prices = formData.getAll("unitPrice").map(amount);
  if (productIds.length !== quantities.length || productIds.length !== prices.length) {
    throw new Error("Las lineas del pedido estan incompletas.");
  }
  return validateCustomerOrderItems(productIds.map((productId, index) => ({
    productId,
    quantity: quantities[index],
    unitPrice: prices[index],
  })));
}

function revalidateCustomerOrder(orderId?: string) {
  revalidatePath("/admin/pedidos");
  if (orderId) revalidatePath(`/admin/pedidos/${orderId}`);
}

export async function saveCustomerOrderAction(
  _previousState: CustomerOrderActionState,
  formData: FormData,
): Promise<CustomerOrderActionState> {
  try {
    const user = await requireAdminActionSession();
    const orderId = String(formData.get("orderId") ?? "").trim() || undefined;
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim() || undefined;
    if (!orderId && !idempotencyKey) throw new Error("Falta la clave de seguridad de la operacion.");
    const result = await saveCustomerOrder({
      orderId,
      idempotencyKey,
      createdBy: user.id,
      customerName: String(formData.get("customerName") ?? ""),
      customerPhone: String(formData.get("customerPhone") ?? ""),
      estimatedDate: String(formData.get("estimatedDate") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      items: readItems(formData),
    });
    revalidateCustomerOrder(result.order_id);
    return {
      status: "success",
      orderId: result.order_id,
      message: result.operation === "updated" ? "Pedido actualizado." : "Pedido creado sin reservar stock.",
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "No se pudo guardar el pedido." };
  }
}

export async function addCustomerOrderPaymentAction(
  _previousState: CustomerOrderActionState,
  formData: FormData,
): Promise<CustomerOrderActionState> {
  const orderId = String(formData.get("orderId") ?? "").trim();
  try {
    await requireAdminActionSession();
    const method = String(formData.get("paymentMethod") ?? "") as OrderPaymentMethod;
    const paymentKey = String(formData.get("paymentKey") ?? "").trim();
    if (!orderId || !paymentKey) throw new Error("Faltan datos para registrar el pago.");
    if (!ORDER_PAYMENT_METHODS.includes(method)) throw new Error("El medio de pago no es valido.");
    const result = await addCustomerOrderPayment({
      orderId,
      method,
      amount: amount(formData.get("paymentAmount")),
      reference: `order:${orderId}:payment:${paymentKey}`,
      notes: String(formData.get("paymentNotes") ?? ""),
    });
    revalidateCustomerOrder(orderId);
    return {
      status: "success",
      orderId,
      message: result.paymentStatus === "paid"
        ? "Pago completo registrado. El stock no se descuenta hasta la entrega."
        : "Pago registrado. El stock no fue reservado ni descontado.",
    };
  } catch (error) {
    return { status: "error", orderId: orderId || undefined, message: error instanceof Error ? error.message : "No se pudo registrar el pago." };
  }
}

export async function transitionCustomerOrderAction(
  _previousState: CustomerOrderActionState,
  formData: FormData,
): Promise<CustomerOrderActionState> {
  const orderId = String(formData.get("orderId") ?? "").trim();
  try {
    const user = await requireAdminActionSession();
    const nextStatus = String(formData.get("nextStatus") ?? "") as CustomerOrderStatus;
    if (!orderId || !CUSTOMER_ORDER_STATUSES.includes(nextStatus)) throw new Error("Estado invalido.");
    await transitionCustomerOrder(orderId, nextStatus, user.id);
    revalidateCustomerOrder(orderId);
    return { status: "success", orderId, message: nextStatus === "cancelled" ? "Pedido cancelado." : "Estado actualizado." };
  } catch (error) {
    return { status: "error", orderId: orderId || undefined, message: error instanceof Error ? error.message : "No se pudo cambiar el estado." };
  }
}

export async function deliverCustomerOrderAction(
  _previousState: CustomerOrderActionState,
  formData: FormData,
): Promise<CustomerOrderActionState> {
  const orderId = String(formData.get("orderId") ?? "").trim();
  try {
    const user = await requireAdminActionSession();
    if (!orderId) throw new Error("Falta el ID del pedido.");
    const result = await deliverCustomerOrder(orderId, user.id);
    revalidateCustomerOrder(orderId);
    revalidatePath("/admin/productos");
    revalidatePath("/admin/inventario");
    return {
      status: "success",
      orderId,
      message: result.status === "already_delivered" ? "El pedido ya estaba entregado." : "Pedido entregado y stock actualizado.",
    };
  } catch (error) {
    return { status: "error", orderId: orderId || undefined, message: error instanceof Error ? error.message : "No se pudo entregar el pedido." };
  }
}
