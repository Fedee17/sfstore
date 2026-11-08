import type { AdminCheckoutRow } from "../../services/checkout-manual-admin.ts";

const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
export function checkoutMoney(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? currency.format(value) : "Importe no disponible";
}
export function checkoutDate(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : "Sin fecha registrada";
}
export function checkoutOrderState(order: AdminCheckoutRow) {
  const terminal = ["cancelled", "expired"].includes(order.state);
  const paid = order.payment_status === "paid";
  const canCredit = !paid && order.payment_status !== "refunded" && order.state === "pending" && order.result.paymentMethod === "transfer";
  const reviewing = order.report?.status === "pending";
  const label = paid ? "Pago acreditado" : order.payment_status === "refunded" ? "Pago reintegrado" : order.state === "cancelled" ? "Cancelado" : order.state === "expired" ? "Vencido" : reviewing ? "Pago para revisar" : order.state === "pending" ? "Esperando pago" : "Revisar estado";
  return { label, canCredit, canReject: canCredit && reviewing, tone: paid ? "success" : terminal ? "neutral" : "warning" };
}
