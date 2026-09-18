import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  ORDER_PAYMENT_ENTRY_STATUSES,
  ORDER_PAYMENT_METHODS,
  calculateOrderPaymentSummary,
  normalizePaymentAmount,
  type OrderPaymentEntryStatus,
  type OrderPaymentMethod,
  type OrderPaymentStatus,
  type OrderPaymentSummary,
} from "@/lib/order-payments";

export {
  ORDER_PAYMENT_ENTRY_STATUSES,
  ORDER_PAYMENT_METHODS,
  calculateOrderPaymentSummary,
};
export type {
  OrderPaymentEntryStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderPaymentSummary,
};

export type OrderPayment = {
  id: string;
  order_id: string;
  method: OrderPaymentMethod;
  amount: number;
  status: OrderPaymentEntryStatus;
  reference: string | null;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AddOrderPaymentInput = {
  orderId: string;
  method: OrderPaymentMethod;
  amount: number;
  status?: OrderPaymentEntryStatus;
  reference?: string | null;
  notes?: string | null;
  paidAt?: string | null;
  allowOverpayment?: boolean;
};

export type AddOrderPaymentResult = OrderPaymentSummary & {
  orderId: string;
  paymentId: string;
  operation: "created" | "updated" | "already_applied";
};

type OrderPaymentRpcResult = {
  order_id: string;
  payment_id: string;
  operation: AddOrderPaymentResult["operation"];
  total_paid: number;
  remaining_amount: number;
  payment_status: OrderPaymentStatus;
};

export async function listOrderPayments(orderId: string) {
  const normalizedOrderId = orderId.trim();

  if (!normalizedOrderId) {
    throw new Error("Falta el ID de la venta.");
  }

  const { data, error } = await getSupabaseAdminClient()
    .from("order_payments")
    .select(
      "id, order_id, method, amount, status, reference, notes, paid_at, created_at, updated_at",
    )
    .eq("order_id", normalizedOrderId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("No se pudieron leer los pagos de la venta.");
  }

  return (data ?? []) as OrderPayment[];
}

export async function getOrderPaymentSummary(
  orderId: string,
): Promise<OrderPaymentSummary> {
  const normalizedOrderId = orderId.trim();

  if (!normalizedOrderId) {
    throw new Error("Falta el ID de la venta.");
  }

  const supabase = getSupabaseAdminClient();
  const [{ data: order, error: orderError }, payments] = await Promise.all([
    supabase
      .from("orders")
      .select("total")
      .eq("id", normalizedOrderId)
      .maybeSingle(),
    listOrderPayments(normalizedOrderId),
  ]);

  if (orderError || !order) {
    throw new Error("La venta no existe.");
  }

  return calculateOrderPaymentSummary(Number(order.total), payments);
}

export async function addOrderPayment(
  input: AddOrderPaymentInput,
): Promise<AddOrderPaymentResult> {
  const orderId = input.orderId.trim();
  const amount = normalizePaymentAmount(input.amount);

  if (!orderId) {
    throw new Error("Falta el ID de la venta.");
  }

  if (!ORDER_PAYMENT_METHODS.includes(input.method)) {
    throw new Error("El medio de pago no es valido.");
  }

  const status = input.status ?? "approved";

  if (!ORDER_PAYMENT_ENTRY_STATUSES.includes(status)) {
    throw new Error("El estado del pago no es valido.");
  }

  if (amount <= 0) {
    throw new Error("El importe del pago debe ser mayor que cero.");
  }

  const { data, error } = await getSupabaseAdminClient().rpc(
    "record_order_payment",
    {
      p_order_id: orderId,
      p_method: input.method,
      p_amount: amount,
      p_status: status,
      p_reference: input.reference?.trim() || null,
      p_notes: input.notes?.trim() || null,
      p_paid_at: input.paidAt ?? null,
      p_allow_overpayment: input.allowOverpayment ?? false,
    },
  );

  if (error) {
    if (error.message.includes("ORDER_PAYMENT_OVERPAYMENT")) {
      throw new Error("Los pagos no pueden superar el total de la venta.");
    }

    if (error.message.includes("ORDER_PAYMENT_REFERENCE_CONFLICT")) {
      throw new Error("La referencia de pago ya pertenece a otra venta.");
    }

    throw new Error("No se pudo registrar el pago.");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("La base no devolvio el resultado del pago.");
  }

  const result = data as OrderPaymentRpcResult;

  return {
    orderId: result.order_id,
    paymentId: result.payment_id,
    operation: result.operation,
    totalPaid: Number(result.total_paid),
    remainingAmount: Number(result.remaining_amount),
    paymentStatus: result.payment_status,
  };
}
