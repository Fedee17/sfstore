export type CheckoutRequest = {
  operationKey: string;
  customer: { fullName: string; phone: string; email?: string };
  shipping: { method: "pickup" | "shipping"; province?: string; city?: string; address?: string; postalCode?: string; carrier?: "Correo Argentino" | "Andreani" | "Via Cargo"; quoteKey?: string };
  paymentMethod: "transfer" | "cash";
  items: { productId: string; quantity: number }[];
};
export type CheckoutResult = {
  id: string; orderNumber: string; subtotal: number; discount: number; shippingCost: number; total: number;
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
export function parseCheckoutRequest(value: unknown): CheckoutRequest {
  const bad = () => { throw new CheckoutError("CHECKOUT_INVALID_REQUEST", 400); };
  if (!record(value)) return bad();
  keys(value, ["operationKey", "customer", "shipping", "paymentMethod", "items"]);
  if (!isUuid(value.operationKey) || !["transfer","cash"].includes(value.paymentMethod as string) || !record(value.customer) || !record(value.shipping)) return bad();
  keys(value.customer, ["fullName", "phone", "email"]);
  if (!text(value.customer.fullName,200) || !text(value.customer.phone,80) || (value.customer.email !== undefined && (!text(value.customer.email,254) || !/^\S+@\S+\.\S+$/.test(value.customer.email as string)))) return bad();
  keys(value.shipping, ["method", "province", "city", "address", "postalCode", "carrier", "quoteKey"]);
  if (value.paymentMethod === "cash" && value.shipping.method !== "pickup") return bad();
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
    if (!record(item)) return bad(); keys(item,["productId","quantity"]);
    if (!isUuid(item.productId) || !Number.isInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 2147483647 || seen.has(item.productId.toLowerCase())) return bad();
    seen.add(item.productId.toLowerCase());
  }
  return value as unknown as CheckoutRequest;
}
