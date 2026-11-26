export type CheckoutRequest = {
  operationKey: string;
  customer: { fullName: string; phone: string; email?: string };
  shipping: { method: "pickup" | "shipping"; province?: string; city?: string; address?: string; postalCode?: string; carrier?: "Correo Argentino" | "Andreani" | "Via Cargo"; quoteKey?: string };
  paymentMethod: "transfer" | "mercadopago";
  // contado (default): one payment at the cash price. financiado: list price in 2-3 card installments (Mercado Pago only).
  priceMode?: "contado" | "financiado";
  items: { productId: string; quantity: number; comboConnector?: "cc" | "lightning" }[];
};
export type CheckoutResult = {
  id: string; priceMode?: "contado" | "financiado"; orderNumber: string; subtotal: number; discount: number; shippingCost: number; total: number;
  state: "pending" | "confirmed" | "cancelled" | "expired"; expiresAt: string;
};
export class CheckoutError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string { return typeof value === "string" && uuid.test(value); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new CheckoutError("CHECKOUT_INVALID_REQUEST", 400);
}
function text(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
// Mercado Pago is accepted only when the server enabled it (lib/payments/mercadopago.ts isMercadoPagoEnabled);
// the database refuses it too while commercial_pricing_settings.mercadopago_enabled is false.
export function parseCheckoutRequest(value: unknown, options: { mercadopago?: boolean } = {}): CheckoutRequest {
  const bad = () => { throw new CheckoutError("CHECKOUT_INVALID_REQUEST", 400); };
  if (!record(value)) return bad();
  keys(value, ["operationKey", "customer", "shipping", "paymentMethod", "priceMode", "items"]);
  const method = value.paymentMethod === "transfer" || (value.paymentMethod === "mercadopago" && options.mercadopago === true);
  const mode = value.priceMode === undefined || value.priceMode === "contado" || (value.priceMode === "financiado" && value.paymentMethod === "mercadopago");
  if (!isUuid(value.operationKey) || !method || !mode || !record(value.customer) || !record(value.shipping)) return bad();
  keys(value.customer, ["fullName", "phone", "email"]);
  if (!text(value.customer.fullName,200) || !text(value.customer.phone,80) || (value.customer.email !== undefined && (!text(value.customer.email,254) || !/^\S+@\S+\.\S+$/.test(value.customer.email as string)))) return bad();
  keys(value.shipping, ["method", "province", "city", "address", "postalCode", "carrier", "quoteKey"]);
  if (!["pickup","shipping"].includes(value.shipping.method as string)) return bad();
  for (const [key, field] of Object.entries(value.shipping)) {
    if (key !== "method" && !text(field, 300)) return bad();
  }
  if (value.shipping.method === "pickup" && Object.keys(value.shipping).length !== 1) return bad();
  if (value.shipping.method === "shipping" && (!["province","city","address","postalCode"].every(key => text((value.shipping as Record<string,unknown>)[key],300))
    || (value.shipping.carrier !== undefined && !["Correo Argentino","Andreani","Via Cargo"].includes(value.shipping.carrier as string)))) return bad();
  if (value.shipping.quoteKey !== undefined && (typeof value.shipping.quoteKey !== "string" || !/^[a-f0-9]{64}$/.test(value.shipping.quoteKey) || !value.shipping.carrier)) return bad();
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 100) return bad();
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!record(item)) return bad(); keys(item,["productId","quantity","comboConnector"]);
    if (item.comboConnector !== undefined && item.comboConnector !== "cc" && item.comboConnector !== "lightning") return bad();
    const key = `${String(item.productId).toLowerCase()}:${item.comboConnector ?? ""}`;
    if (!isUuid(item.productId) || !Number.isInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 2147483647 || seen.has(key)) return bad();
    seen.add(key);
  }
  return value as unknown as CheckoutRequest;
}
