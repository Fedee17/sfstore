import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { authorizeCheckoutBuyer } from "@/services/checkout-server";
import type { MercadoPagoDeps } from "@/lib/payments/mercadopago-handlers";
import type { MercadoPagoPaymentRecord } from "@/lib/payments/mercadopago";

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
  if (!response.ok) throw new Error(`MERCADOPAGO_HTTP_${response.status}`);
  return response.json() as Promise<T>;
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
    createPayment: request => mp<MercadoPagoPaymentRecord>("/v1/payments", { method: "POST", body: JSON.stringify(request.body), idempotencyKey: request.idempotencyKey }),
    getPayment: id => mp<MercadoPagoPaymentRecord>(`/v1/payments/${encodeURIComponent(id)}`),
  };
}
