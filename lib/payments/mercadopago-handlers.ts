import { CheckoutError, isUuid } from "../checkout/contract.ts";
import { MAX_INSTALLMENTS } from "../products/commercial-pricing.ts";
import { contadoPreference, financedPayment, isMercadoPagoEnabled, settleMercadoPagoPayment, verifyWebhookSignature,
  type MercadoPagoOrder, type MercadoPagoPaymentRecord } from "./mercadopago.ts";

// Request handlers mounted in app/api/mercadopago/*. They answer 410 until both switches are on: server environment
// (MERCADOPAGO_PAYMENTS_ENABLED=1 with credentials) and checkout_payment_settings.mercadopago_enabled in the database. Every dependency is injected so tests never reach the network.

export type MercadoPagoDeps = {
  env: Record<string, string | undefined>;
  nowMs: () => number;
  authorizeBuyer: () => Promise<string | null>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>; // Supabase service role, throws on error.
  createPreference: (body: ReturnType<typeof contadoPreference>) => Promise<{ init_point?: string }>;
  createPayment: (request: ReturnType<typeof financedPayment>) => Promise<MercadoPagoPaymentRecord>;
  getPayment: (id: string) => Promise<MercadoPagoPaymentRecord>;
};

const noStore = { "Cache-Control": "no-store" };
const disabled = () => Response.json({ code: "AUTOMATIC_PAYMENTS_DISABLED", error: "Los pagos automáticos no están habilitados." }, { status: 410, headers: noStore });
const failure = (error: unknown) => {
  const known = error instanceof CheckoutError;
  return Response.json({ code: known ? error.code : "PAYMENT_UNAVAILABLE", error: "No se pudo iniciar el pago. Revisá tu pedido e intentá nuevamente." },
    { status: known ? error.status : 503, headers: noStore });
};

async function readJson(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new CheckoutError("PAYMENT_INVALID_REQUEST", 415);
  const text = await request.text();
  if (text.length > maxBytes) throw new CheckoutError("PAYMENT_INVALID_REQUEST", 413);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new CheckoutError("PAYMENT_INVALID_REQUEST", 400); }
}

/** The buyer's own pending Mercado Pago order, as stored (amount, mode, reference and expiry never come from the browser). */
async function loadBuyerOrder(deps: MercadoPagoDeps, orderId: unknown): Promise<MercadoPagoOrder> {
  const buyer = await deps.authorizeBuyer();
  if (!isUuid(buyer)) throw new CheckoutError("CHECKOUT_UNAUTHORIZED", 401);
  if (!isUuid(orderId)) throw new CheckoutError("PAYMENT_INVALID_REQUEST", 400);
  const order = toOrder(await deps.rpc("checkout_mercadopago_order", { p_buyer_id: buyer, p_order_id: orderId }));
  if (!order) throw new CheckoutError("CHECKOUT_NOT_FOUND", 404);
  return order;
}

function toOrder(value: unknown): MercadoPagoOrder | null {
  const row = value as { reference?: unknown; priceMode?: unknown; total?: unknown; expiresAt?: unknown } | null;
  const total = Number(row?.total);
  if (!row || typeof row.reference !== "string" || (row.priceMode !== "contado" && row.priceMode !== "financiado")
    || !Number.isFinite(total) || total <= 0 || typeof row.expiresAt !== "string") return null;
  return { reference: row.reference, mode: row.priceMode, totalCents: BigInt(Math.round(total * 100)), expiresAt: row.expiresAt, description: `Pedido ${row.reference}` };
}

/** Checkout Pro (contado): returns the Mercado Pago URL for the stored contado total. */
export async function handleCreatePreference(request: Request, deps: MercadoPagoDeps): Promise<Response> {
  if (!isMercadoPagoEnabled(deps.env)) return disabled();
  try {
    const body = await readJson(request);
    const order = await loadBuyerOrder(deps, body.orderId);
    if (order.mode !== "contado") throw new CheckoutError("PAYMENT_MODE_MISMATCH", 409);
    const preference = await deps.createPreference(contadoPreference(order, deps.env.NEXT_PUBLIC_SITE_URL ?? "", String(body.orderId)));
    if (typeof preference.init_point !== "string" || !preference.init_point.startsWith("https://")) throw new CheckoutError("PAYMENT_UNAVAILABLE", 502);
    return Response.json({ url: preference.init_point }, { headers: noStore });
  } catch (error) { return failure(error); }
}

/** Checkout API (financiado): charges the stored list total in 2-3 installments with the Card Payment Brick token. */
export async function handleCardPayment(request: Request, deps: MercadoPagoDeps): Promise<Response> {
  if (!isMercadoPagoEnabled(deps.env)) return disabled();
  try {
    const body = await readJson(request);
    const order = await loadBuyerOrder(deps, body.orderId);
    if (order.mode !== "financiado") throw new CheckoutError("PAYMENT_MODE_MISMATCH", 409);
    const installments = body.installments;
    if (typeof installments !== "number" || !Number.isInteger(installments) || installments < 2 || installments > MAX_INSTALLMENTS) throw new CheckoutError("PAYMENT_INSTALLMENTS_INVALID", 400);
    const email = typeof body.payerEmail === "string" && body.payerEmail.length <= 254 && /^\S+@\S+\.\S+$/.test(body.payerEmail) ? body.payerEmail : null;
    if (!email || typeof body.token !== "string" || typeof body.paymentMethodId !== "string" || (body.issuerId !== undefined && typeof body.issuerId !== "string")) {
      throw new CheckoutError("PAYMENT_INVALID_REQUEST", 400);
    }
    let paymentRequest: ReturnType<typeof financedPayment>;
    try {
      paymentRequest = financedPayment(order, { token: body.token, installments, paymentMethodId: body.paymentMethodId, issuerId: body.issuerId as string | undefined, payerEmail: email });
    } catch { throw new CheckoutError("PAYMENT_INVALID_REQUEST", 400); }
    const created = await deps.createPayment(paymentRequest);
    // Confirm through the same path as the webhook: re-read the payment and match it against the stored order.
    const outcome = await settle(String(created.id), deps);
    return Response.json({ status: outcome }, { headers: noStore });
  } catch (error) { return failure(error); }
}

function settle(paymentId: string, deps: MercadoPagoDeps) {
  return settleMercadoPagoPayment(paymentId, {
    fetchPayment: id => deps.getPayment(id),
    loadOrder: async reference => toOrder(await deps.rpc("checkout_mercadopago_order_by_reference", { p_reference: reference })),
    approve: async input => {
      const result = await deps.rpc("confirm_checkout_mercadopago_payment", { p_provider_payment_id: input.providerPaymentId, p_reference: input.reference,
        p_amount: Number(input.amountCents) / 100, p_installments: input.installments, p_method: input.method, p_currency: "ARS" }) as { status?: string } | null;
      if (result?.status !== "approved") throw new Error("El pago quedó en revisión.");
    },
    review: async input => { await deps.rpc("review_checkout_mercadopago_payment", { p_provider_payment_id: input.providerPaymentId, p_reference: input.reference, p_reason: input.reason }); },
  });
}

/** Webhook: authenticated by signature, payment re-read from Mercado Pago, confirmation decided by the database. */
export async function handleWebhook(request: Request, deps: MercadoPagoDeps): Promise<Response> {
  if (!isMercadoPagoEnabled(deps.env)) return disabled();
  try {
    const url = new URL(request.url);
    const body = await readJson(request, 8192).catch(() => ({} as Record<string, unknown>));
    const data = body.data as { id?: unknown } | undefined;
    const dataId = url.searchParams.get("data.id") ?? (typeof data?.id === "string" || typeof data?.id === "number" ? String(data.id) : "");
    const type = url.searchParams.get("type") ?? body.type;
    const valid = verifyWebhookSignature({ signature: request.headers.get("x-signature"), requestId: request.headers.get("x-request-id"), dataId,
      secret: deps.env.MERCADO_PAGO_WEBHOOK_SECRET ?? "", nowMs: deps.nowMs() });
    if (!valid) return Response.json({ code: "WEBHOOK_SIGNATURE_INVALID" }, { status: 401, headers: noStore });
    if (type !== "payment") return new Response(null, { status: 204, headers: noStore });
    await settle(dataId, deps);
    return new Response(null, { status: 200, headers: noStore });
  } catch {
    // Non-2xx makes Mercado Pago retry; settlement is idempotent per payment id.
    return Response.json({ code: "WEBHOOK_RETRY" }, { status: 503, headers: noStore });
  }
}
