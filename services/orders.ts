import type { CartItem } from "@/store/cart-store";
import type { CheckoutResult } from "@/lib/checkout/contract";
import {checkoutErrorMessage,checkoutConnectionError} from '@/lib/checkout/feedback';

export type PaymentMethod = "transfer" | "mercadopago";
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
  priceMode?: "contado" | "financiado"; // Mercado Pago only; the server prices each mode.
  items: CartItem[];
};

export type CreatedOrder = CheckoutResult;

export async function createOrderFromCheckout(payload: CreateOrderFromCheckoutPayload): Promise<CreatedOrder> {
  const request = {
    customer: payload.customer,
    shipping: payload.shipping.method === "pickup" ? { method: "pickup" } : payload.shipping,
    paymentMethod: payload.paymentMethod,
    ...(payload.paymentMethod === "mercadopago" && payload.priceMode ? { priceMode: payload.priceMode } : {}),
    items: payload.items.map(item => ({ productId: item.productId, quantity: item.quantity, ...(item.comboConnector ? { comboConnector: item.comboConnector } : {}) }))
      .sort((a,b) => a.productId.localeCompare(b.productId) || (a.comboConnector ?? "").localeCompare(b.comboConnector ?? "")),
  };
  const operationKey = await getCheckoutOperationKey(request);
  const response = await fetch("/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, operationKey }),
  }).catch(()=>{throw new Error(checkoutConnectionError);});
  const result = await response.json().catch(()=>{throw new Error(checkoutErrorMessage(null));});
  if (!response.ok) throw new Error(checkoutErrorMessage(result.code));
  if (result.state !== "pending") throw new Error("Este pedido ya no está pendiente. Revisá su estado antes de volver a comprar.");
  return result as CreatedOrder;
}

export const checkoutOperationStorageKey = "sfstore-checkout-operation";
export const quotationOperationStorageKey = "sfstore-shipping-quotation-operation";

/** After an order exists its idempotency keys are spent; leaving them would make the next purchase in this tab look like a lost session. */
export function clearCheckoutOperations() {
  try { sessionStorage.removeItem(checkoutOperationStorageKey); sessionStorage.removeItem(quotationOperationStorageKey); } catch { /* Storage unavailable: nothing to clear. */ }
}

export async function getCheckoutOperationKey(request: unknown, storageKey = checkoutOperationStorageKey) {
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
