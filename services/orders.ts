import type { CartItem } from "@/store/cart-store";
import type { CheckoutResult } from "@/lib/checkout/contract";

export type PaymentMethod = "transfer";
export type ShippingMethod = "pickup" | "shipping";

export type CheckoutCustomer = {
  fullName: string;
  phone: string;
  email?: string;
};

export type CheckoutShipping = {
  method: ShippingMethod;
  province?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  carrier?: "Correo Argentino" | "Andreani" | "Via Cargo";
  quoteKey?: string;
};

export type CreateOrderFromCheckoutPayload = {
  customer: CheckoutCustomer;
  shipping: CheckoutShipping;
  paymentMethod: PaymentMethod;
  items: CartItem[];
};

export type CreatedOrder = CheckoutResult;

export async function createOrderFromCheckout(payload: CreateOrderFromCheckoutPayload): Promise<CreatedOrder> {
  const request = {
    customer: payload.customer,
    shipping: payload.shipping.method === "pickup" ? { method: "pickup" } : payload.shipping,
    paymentMethod: payload.paymentMethod,
    items: payload.items.map(item => ({ productId: item.productId, quantity: item.quantity }))
      .sort((a,b) => a.productId.localeCompare(b.productId)),
  };
  const operationKey = await getCheckoutOperationKey(request);
  const response = await fetch("/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, operationKey }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "No se pudo preparar el pedido.");
  if (result.state !== "pending") throw new Error("Este pedido ya no está pendiente. Revisá su estado antes de volver a comprar.");
  return result as CreatedOrder;
}

export async function getCheckoutOperationKey(request: unknown, storageKey = "sfstore-checkout-operation") {
  const serialized = JSON.stringify(request);
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(serialized));
  const signature = Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
  let operation: { signature:string; key:string } | null = null;
  try { operation = JSON.parse(sessionStorage.getItem(storageKey)??"null"); } catch { /* Invalid local metadata is replaced. */ }
  // Upgrade an old plaintext signature without changing its idempotency key.
  if (operation?.signature === serialized) { operation.signature = signature; sessionStorage.setItem(storageKey,JSON.stringify(operation)); }
  if (operation?.signature !== signature) { operation = {signature,key:crypto.randomUUID()};sessionStorage.setItem(storageKey,JSON.stringify(operation)); }
  return operation.key;
}
