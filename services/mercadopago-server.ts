import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { authorizeCheckoutBuyer } from "@/services/checkout-server";
import type { MercadoPagoDeps } from "@/lib/payments/mercadopago-handlers";
import type { MercadoPagoOrderRecord, MercadoPagoPaymentRecord } from "@/lib/payments/mercadopago";

// Production adapters for lib/payments/mercadopago-handlers.ts: Mercado Pago REST API with the server access token
// (never sent to the browser) and Supabase service-role RPCs. Requests time out instead of hanging the checkout.
const API = "https://api.mercadopago.com";

async function mp<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_NOT_CONFIGURED");
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.ok) return response.json() as Promise<T>;
  throw new Error(`MERCADOPAGO_HTTP_${response.status}`);
}

async function getProviderOrder(id: string): Promise<MercadoPagoOrderRecord> {
  const order = await mp<MercadoPagoOrderRecord>(`/v1/orders/${encodeURIComponent(id)}`);
  const currencyNeeded = order.status === "created" || (order.status === "processed" && order.status_detail === "accredited");
  if (order.currency || !currencyNeeded) return order;

  // The ID endpoint can omit currency. The Orders search response includes it.
  const createdMs = Date.parse(order.created_date ?? "");
  const now = Date.now();
  if (!Number.isFinite(createdMs) || createdMs > now || order.id !== id || !order.external_reference) throw new Error("MERCADOPAGO_ORDER_CURRENCY_UNAVAILABLE");
  const hour = 60 * 60 * 1000;
  const query = new URLSearchParams({
    external_reference: order.external_reference, type: "online", page_size: "50",
    begin_date: new Date(createdMs - hour).toISOString(), end_date: new Date(Math.min(now, createdMs + hour)).toISOString(),
  });
  const result = await mp<{ data?: { id: string; external_reference: string; currency?: string }[] }>(`/v1/orders?${query}`);
  const exact = result.data?.find(row => row.id === id && row.external_reference === order.external_reference);
  if (typeof exact?.currency !== "string" || !exact.currency) throw new Error("MERCADOPAGO_ORDER_CURRENCY_UNAVAILABLE");
  return { ...order, currency: exact.currency };
}

export function mercadoPagoDeps(): MercadoPagoDeps {
  return {
    env: process.env,
    nowMs: () => Date.now(),
    authorizeBuyer: authorizeCheckoutBuyer,
    rpc: async (name, args) => {
      const { data, error } = await getSupabaseAdminClient().rpc(name, args);
      if (error) throw new Error(error.message);
      return data;
    },
    createPreference: body => mp("/checkout/preferences", { method: "POST", body: JSON.stringify(body) }),
    expirePreference: async (id, body) => { await mp(`/checkout/preferences/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }); },
    createOrder: request => mp<MercadoPagoOrderRecord>("/v1/orders", { method: "POST", body: JSON.stringify(request.body), idempotencyKey: request.idempotencyKey }),
    processOrder: async (id, idempotencyKey) => {
      await mp(`/v1/orders/${encodeURIComponent(id)}/process`, { method: "POST", idempotencyKey });
    },
    getOrder: getProviderOrder,
    getPayment: id => mp<MercadoPagoPaymentRecord>(`/v1/payments/${encodeURIComponent(id)}`),
  };
}
