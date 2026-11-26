import { parseAdminMoneyCents } from "../products/admin-price-calculation.ts";
import { MAX_INSTALLMENTS } from "../products/commercial-pricing.ts";

// Server-side rule for confirming an order: the payment actually received must match the price mode the
// order was created with. Any mismatch is rejected (refund or manual review); it never confirms the order.
export type PriceMode = "contado" | "financiado";
export type ReceivedMethod = "cash" | "transfer" | "account_money" | "debit_card" | "credit_card";
export type ReceivedPayment = { method: ReceivedMethod; installments: number; amountCents: bigint; currency: string; approved: boolean; externalReference: string };
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
  if (payment.amountCents !== order.totalCents) throw new Error("El importe no coincide con el total del pedido.");
}

// Mercado Pago payment (GET /v1/payments/{id}) → received payment. Unknown types fail closed.
const MP_TYPES: Record<string, ReceivedMethod> = { account_money: "account_money", debit_card: "debit_card", prepaid_card: "debit_card", credit_card: "credit_card" };
export function fromMercadoPagoPayment(payment: { payment_type_id: string; installments: number; transaction_amount: number; currency_id: string; status: string; external_reference: string }): ReceivedPayment {
  const method = MP_TYPES[payment.payment_type_id];
  if (!method) throw new Error("Medio de Mercado Pago no habilitado: " + payment.payment_type_id + ".");
  return { method, installments: payment.installments, amountCents: parseAdminMoneyCents(String(payment.transaction_amount)), currency: payment.currency_id, approved: payment.status === "approved", externalReference: payment.external_reference };
}
