import { parseAdminMoneyCents } from "../products/admin-price-calculation.ts";
import { MAX_INSTALLMENTS } from "../products/commercial-pricing.ts";

// Server-side rule for confirming an order: the payment actually received must match the price mode the
// order was created with. Any mismatch is rejected (refund or manual review); it never confirms the order.
export type PriceMode = "contado" | "financiado";
export type ReceivedMethod = "cash" | "transfer" | "account_money" | "debit_card" | "credit_card";
export type ReceivedPayment = { method: ReceivedMethod; installments: number; amountCents: bigint; orderAmountCents?: bigint; currency: string; approved: boolean; externalReference: string };
export type PayableOrder = { reference: string; mode: PriceMode; totalCents: bigint };

export function priceModeFor(method: ReceivedMethod, installments: number): PriceMode {
  if (!Number.isInteger(installments) || installments < 1) throw new Error("Cantidad de cuotas inválida.");
  if (installments === 1) return "contado";
  if (method !== "credit_card" || installments > MAX_INSTALLMENTS) throw new Error("Cuotas no habilitadas para este medio.");
  return "financiado";
}

export function assertPaymentMatchesOrder(order: PayableOrder, payment: ReceivedPayment) {
  if (!payment.approved) throw new Error("El pago no está aprobado.");
  if (payment.externalReference !== order.reference) throw new Error("El pago no corresponde a este pedido.");
  if (payment.currency !== "ARS") throw new Error("Moneda no admitida.");
  if (priceModeFor(payment.method, payment.installments) !== order.mode) throw new Error("El medio o las cuotas no corresponden al precio del pedido.");
  if (payment.orderAmountCents !== undefined && payment.orderAmountCents !== order.totalCents) throw new Error("El importe de la orden de Mercado Pago no coincide con el total del pedido.");
  if (payment.amountCents !== order.totalCents) throw new Error("El importe no coincide con el total del pedido.");
}

// Mercado Pago payment (GET /v1/payments/{id}) → received payment. Unknown types fail closed.
const MP_TYPES: Record<string, ReceivedMethod> = { account_money: "account_money", debit_card: "debit_card", prepaid_card: "debit_card", credit_card: "credit_card" };
export function fromMercadoPagoPayment(payment: { payment_type_id: string; installments: number; transaction_amount: number; currency_id: string; status: string; external_reference: string }): ReceivedPayment {
  const method = MP_TYPES[payment.payment_type_id];
  if (!method) throw new Error("Medio de Mercado Pago no habilitado: " + payment.payment_type_id + ".");
  return { method, installments: payment.installments, amountCents: parseAdminMoneyCents(String(payment.transaction_amount)), currency: payment.currency_id, approved: payment.status === "approved", externalReference: payment.external_reference };
}

// Mercado Pago Orders API order (GET /v1/orders/{id}) → one transaction with both the nominal and actually paid amounts.
type OrdersApiOrder = { status: string; status_detail: string; external_reference: string; total_amount: string; currency?: string;
  transactions?: { payments?: { amount: string; paid_amount?: string; status: string; status_detail: string; payment_method: { type: string; installments: number } }[] } };
export function fromMercadoPagoOrder(order: OrdersApiOrder): ReceivedPayment {
  const payments = order.transactions?.payments ?? [];
  if (payments.length !== 1) throw new Error("La orden de Mercado Pago debe tener una sola transacción.");
  const [payment] = payments;
  const method = MP_TYPES[payment.payment_method?.type];
  if (!method) throw new Error("Medio de Mercado Pago no habilitado: " + payment.payment_method?.type + ".");
  const orderAmountCents = parseAdminMoneyCents(order.total_amount);
  if (parseAdminMoneyCents(payment.amount) !== orderAmountCents) throw new Error("El importe de la transacción no coincide con la orden.");
  if (typeof payment.paid_amount !== "string") throw new Error("Mercado Pago no informó el importe efectivamente pagado.");
  const amountCents = parseAdminMoneyCents(payment.paid_amount);
  const approved = order.status === "processed" && order.status_detail === "accredited" && payment.status === "processed" && payment.status_detail === "accredited";
  return { method, installments: payment.payment_method.installments, amountCents, orderAmountCents, currency: order.currency ?? "", approved, externalReference: order.external_reference };
}
