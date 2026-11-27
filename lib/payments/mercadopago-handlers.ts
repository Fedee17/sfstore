import { CheckoutError, isUuid } from "../checkout/contract.ts";
import { MAX_INSTALLMENTS } from "../products/commercial-pricing.ts";
import { parseAdminMoneyCents } from "../products/admin-price-calculation.ts";
import { contadoPreference, expiredPreference, financedOrder, isMercadoPagoEnabled, settleMercadoPagoOrder, settleMercadoPagoPayment,
  verifyWebhookSignature, type MercadoPagoOrder, type MercadoPagoOrderRecord, type MercadoPagoPaymentRecord, type SettlementDeps } from "./mercadopago.ts";

// Request handlers mounted in app/api/mercadopago/*. They answer 410 until both switches are on: server environment
// (MERCADOPAGO_PAYMENTS_ENABLED=1 with credentials) and checkout_payment_settings.mercadopago_enabled in the database.
// Every dependency is injected so tests never reach the network.

export type MercadoPagoDeps = {
  env: Record<string, string | undefined>;
  nowMs: () => number;
  authorizeBuyer: () => Promise<string | null>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>; // Supabase service role, throws Error(message) on error.
  createPreference: (body: ReturnType<typeof contadoPreference>) => Promise<{ id?: string; init_point?: string }>;
  expirePreference: (id: string, body: ReturnType<typeof expiredPreference>) => Promise<void>;
  createOrder: (request: ReturnType<typeof financedOrder> & { idempotencyKey: string }) => Promise<MercadoPagoOrderRecord>;
  processOrder: (id: string, idempotencyKey: string) => Promise<void>;
  getOrder: (id: string) => Promise<MercadoPagoOrderRecord>;
  getPayment: (id: string) => Promise<MercadoPagoPaymentRecord>;
};

const noStore = { "Cache-Control": "no-store" };
const disabled = () => Response.json({ code: "AUTOMATIC_PAYMENTS_DISABLED", error: "Los pagos automáticos no están habilitados." }, { status: 410, headers: noStore });
const failure = (error: unknown) => {
  const known = error instanceof CheckoutError;
  const message = known && error.code === "CHECKOUT_ALREADY_PAID" ? "Este pedido ya está pagado. No hace falta volver a pagar."
    : "No se pudo iniciar el pago. Revisá tu pedido e intentá nuevamente.";
  return Response.json({ code: known ? error.code : "PAYMENT_UNAVAILABLE", error: message }, { status: known ? error.status : 503, headers: noStore });
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

// Database refusals that the buyer must see as such (anything else stays a generic, retryable failure).
const ORDER_REFUSALS: Record<string, number> = { CHECKOUT_ALREADY_PAID: 409, CHECKOUT_EXPIRED: 409, CHECKOUT_NOT_FOUND: 404, CHECKOUT_PAYMENT_METHOD_DISABLED: 410, PAYMENT_MODE_MISMATCH: 409 };

type PayableMercadoPagoOrder = MercadoPagoOrder & { buyerId: string; orderId: string; preferenceUrl: string | null };

/** The buyer's own pending, unpaid Mercado Pago order, as stored (amount, mode, reference and expiry never come from the browser). */
async function loadBuyerOrder(deps: MercadoPagoDeps, orderId: unknown): Promise<PayableMercadoPagoOrder> {
  const buyer = await deps.authorizeBuyer();
  if (!isUuid(buyer)) throw new CheckoutError("CHECKOUT_UNAUTHORIZED", 401);
  if (!isUuid(orderId)) throw new CheckoutError("PAYMENT_INVALID_REQUEST", 400);
  const row = await orderRpc(deps, "checkout_mercadopago_order", { p_buyer_id: buyer, p_order_id: orderId });
  const order = toOrder(row);
  if (!order) throw new CheckoutError("CHECKOUT_NOT_FOUND", 404);
  const url = (row as { preferenceUrl?: unknown }).preferenceUrl;
  return { ...order, buyerId: buyer, orderId, preferenceUrl: typeof url === "string" && url.startsWith("https://") ? url : null };
}

async function orderRpc(deps: MercadoPagoDeps, name: string, args: Record<string, unknown>) {
  try { return await deps.rpc(name, args); }
  catch (error) {
    const code = error instanceof Error ? Object.keys(ORDER_REFUSALS).find(known => error.message.includes(known)) : undefined;
    if (code) throw new CheckoutError(code, ORDER_REFUSALS[code]);
    throw error;
  }
}

function toOrder(value: unknown): MercadoPagoOrder | null {
  const row = value as { reference?: unknown; priceMode?: unknown; total?: unknown; expiresAt?: unknown } | null;
  const total = Number(row?.total);
  if (!row || typeof row.reference !== "string" || (row.priceMode !== "contado" && row.priceMode !== "financiado")
    || !Number.isFinite(total) || total <= 0 || typeof row.expiresAt !== "string") return null;
  return { reference: row.reference, mode: row.priceMode, totalCents: BigInt(Math.round(total * 100)), expiresAt: row.expiresAt, description: `Pedido ${row.reference}` };
}

/** Checkout Pro (contado): returns the Mercado Pago URL for the stored contado total, reusing the order's open link. */
export async function handleCreatePreference(request: Request, deps: MercadoPagoDeps): Promise<Response> {
  if (!isMercadoPagoEnabled(deps.env)) return disabled();
  try {
    const body = await readJson(request);
    const order = await loadBuyerOrder(deps, body.orderId);
    if (order.mode !== "contado") throw new CheckoutError("PAYMENT_MODE_MISMATCH", 409);
    if (order.preferenceUrl) return Response.json({ url: order.preferenceUrl }, { headers: noStore });
    const preference = await deps.createPreference(contadoPreference(order, deps.env.NEXT_PUBLIC_SITE_URL ?? "", String(body.orderId)));
    if (typeof preference.init_point !== "string" || !preference.init_point.startsWith("https://") || typeof preference.id !== "string") throw new CheckoutError("PAYMENT_UNAVAILABLE", 502);
    await deps.rpc("record_checkout_mercadopago_preference", { p_order_id: body.orderId, p_preference_id: preference.id, p_init_point: preference.init_point });
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
    if (!email || typeof body.token !== "string" || typeof body.paymentMethodId !== "string") throw new CheckoutError("PAYMENT_INVALID_REQUEST", 400);
    let orderRequest: ReturnType<typeof financedOrder>;
    try {
      orderRequest = financedOrder(order, { token: body.token, installments, paymentMethodId: body.paymentMethodId, payerEmail: email });
    } catch { throw new CheckoutError("PAYMENT_INVALID_REQUEST", 400); }
    const outcome = await processCardAttempt(deps, order, orderRequest);
    return Response.json({ status: outcome }, { headers: noStore });
  } catch (error) { return failure(error); }
}

const CARD_ORDER_ID = /^ORD[A-Z0-9]{8,60}$/;
const UNPAID_TERMINAL = new Set(["failed", "canceled", "expired"]);

async function processCardAttempt(deps: MercadoPagoDeps, order: PayableMercadoPagoOrder, request: ReturnType<typeof financedOrder>) {
  const checkout = { p_buyer_id: order.buyerId, p_order_id: order.orderId };
  const attempt = await orderRpc(deps, "claim_checkout_mercadopago_card_attempt", checkout) as {
    busy?: boolean; attemptId?: unknown; leaseId?: unknown; providerOrderId?: unknown;
  } | null;
  if (attempt?.busy === true) return "pending";
  if (!attempt || !isUuid(attempt.attemptId) || !isUuid(attempt.leaseId)) throw new Error("MERCADOPAGO_ATTEMPT_UNAVAILABLE");

  const bound = attempt.providerOrderId;
  if (bound !== null && (typeof bound !== "string" || !CARD_ORDER_ID.test(bound))) throw new Error("MERCADOPAGO_ATTEMPT_UNAVAILABLE");
  // Manual creation cannot charge. Only the provider order fenced by the current database lease can be processed.
  let record = bound === null
    ? await deps.createOrder({ ...request, idempotencyKey: `create-${attempt.attemptId}` })
    : await deps.getOrder(bound).catch(() => null);
  const id = bound ?? record?.id;
  if (!record || typeof id !== "string" || !matchesCardOrder(record, id, order)) return "pending";

  if (bound === null || record.status === "created") {
    const boundByLease = await orderRpc(deps, "bind_checkout_mercadopago_card_attempt", {
      ...checkout, p_lease_id: attempt.leaseId, p_provider_order_id: id,
    });
    if (boundByLease !== true) return "pending";
  }
  if (bound === null && !record.currency && record.status === "created") {
    record = await deps.getOrder(id).catch(() => null);
    if (!record || !matchesCardOrder(record, id, order)) return "pending";
    if (record.status === "created" && await orderRpc(deps, "bind_checkout_mercadopago_card_attempt", {
      ...checkout, p_lease_id: attempt.leaseId, p_provider_order_id: id,
    }) !== true) return "pending";
  }
  if (record.status === "created") {
    if (!canProcessCardOrder(record, order)) return "pending";
    // Reprocessing always uses the same remote ID and key, even after a lost response.
    await deps.processOrder(id, `process-${attempt.attemptId}`).catch(() => undefined);
    record = await deps.getOrder(id).catch(() => null);
    if (!record || !matchesCardOrder(record, id, order)) return "pending";
  }

  const providerOrder = record;
  const outcome = await settleMercadoPagoOrder(id, { ...settlementDeps(deps), fetchOrder: async () => providerOrder });
  if (outcome !== "rejected") return outcome;
  const payments = providerOrder.transactions?.payments ?? [];
  if (!(UNPAID_TERMINAL.has(providerOrder.status) && payments.length === 1
    && !hasPaidAmount(providerOrder.total_paid_amount)
    && payments.every(payment => UNPAID_TERMINAL.has(payment.status) && !hasPaidAmount(payment.paid_amount)))) return "review";
  await deps.rpc("release_checkout_mercadopago_card_attempt", {
    p_order_id: order.orderId, p_lease_id: attempt.leaseId, p_provider_order_id: id,
  });
  return outcome;
}

function matchesCardOrder(record: MercadoPagoOrderRecord, id: string, order: MercadoPagoOrder) {
  return CARD_ORDER_ID.test(id) && record.id === id && record.external_reference === order.reference;
}

function canProcessCardOrder(record: MercadoPagoOrderRecord, order: MercadoPagoOrder) {
  const transactions = record.transactions?.payments;
  if (record.processing_mode !== "manual" || record.currency !== "ARS" || transactions?.length !== 1) return false;
  const payment = transactions[0];
  const installments = payment.payment_method?.installments;
  if (payment.status !== "created" || payment.payment_method?.type !== "credit_card" || !Number.isInteger(installments)
    || installments < 2 || installments > MAX_INSTALLMENTS || hasPaidAmount(record.total_paid_amount) || hasPaidAmount(payment.paid_amount)) return false;
  try { return parseAdminMoneyCents(record.total_amount) === order.totalCents && parseAdminMoneyCents(payment.amount) === order.totalCents; }
  catch { return false; }
}

function hasPaidAmount(amount: string | undefined) {
  if (amount == null) return false;
  try { return parseAdminMoneyCents(amount) !== BigInt(0); } catch { return true; }
}

function settlementDeps(deps: MercadoPagoDeps): SettlementDeps {
  return {
    loadOrder: async reference => toOrder(await deps.rpc("checkout_mercadopago_order_by_reference", { p_reference: reference })),
    approve: async input => {
      const result = await deps.rpc("confirm_checkout_mercadopago_payment", { p_provider_payment_id: input.providerPaymentId, p_reference: input.reference,
        p_amount: Number(input.amountCents) / 100, p_installments: input.installments, p_method: input.method, p_currency: "ARS" }) as { status?: string; orderId?: unknown } | null;
      if (result?.status !== "approved" && result?.status !== "review") throw new Error("MERCADOPAGO_CONFIRMATION_UNKNOWN");
      // Paid (now or by an earlier charge): close every Checkout Pro link SFSTORE handed out for this order.
      if (isUuid(result.orderId)) await expireOpenPreferences(deps, result.orderId);
      return result.status;
    },
    review: async input => { await deps.rpc("review_checkout_mercadopago_payment", { p_provider_payment_id: input.providerPaymentId, p_reference: input.reference, p_reason: input.reason,
      p_amount: input.amountCents === null ? null : Number(input.amountCents) / 100 }); },
  };
}

async function expireOpenPreferences(deps: MercadoPagoDeps, orderId: string) {
  const open = await deps.rpc("open_checkout_mercadopago_preferences", { p_order_id: orderId });
  for (const id of Array.isArray(open) ? open.filter((value): value is string => typeof value === "string") : []) {
    await deps.expirePreference(id, expiredPreference(new Date(deps.nowMs()).toISOString()));
    await deps.rpc("expire_checkout_mercadopago_preference", { p_preference_id: id });
  }
}

/**
 * Webhook: authenticated by signature, charge re-read from Mercado Pago, confirmation decided by the database.
 * Topic "payment" carries Checkout Pro payments; topic "order" carries Checkout API orders.
 */
export async function handleWebhook(request: Request, deps: MercadoPagoDeps): Promise<Response> {
  const enabled = isMercadoPagoEnabled(deps.env);
  if (!enabled && !deps.env.MERCADO_PAGO_WEBHOOK_SECRET) return disabled();
  try {
    const url = new URL(request.url);
    const body = await readJson(request, 16384).catch(() => ({} as Record<string, unknown>));
    const data = body.data as { id?: unknown } | undefined;
    const dataId = url.searchParams.get("data.id") ?? (typeof data?.id === "string" || typeof data?.id === "number" ? String(data.id) : "");
    const type = url.searchParams.get("type") ?? body.type;
    const valid = verifyWebhookSignature({ signature: request.headers.get("x-signature"), requestId: request.headers.get("x-request-id"), dataId,
      secret: deps.env.MERCADO_PAGO_WEBHOOK_SECRET ?? "", nowMs: deps.nowMs() });
    if (!valid) return Response.json({ code: "WEBHOOK_SIGNATURE_INVALID" }, { status: 401, headers: noStore });
    // Payments off but secret loaded: the signature is still checked, so the panel's simulation verifies URL and secret,
    // and nothing is read or settled. 503 keeps Mercado Pago retrying a real notification until payments are back on.
    if (!enabled) return Response.json({ code: "AUTOMATIC_PAYMENTS_DISABLED" }, { status: 503, headers: noStore });
    if (type === "payment") await settleMercadoPagoPayment(dataId, { ...settlementDeps(deps), fetchPayment: id => deps.getPayment(id) });
    else if (type === "order") await settleMercadoPagoOrder(dataId.toUpperCase(), { ...settlementDeps(deps), fetchOrder: id => deps.getOrder(id) });
    else return new Response(null, { status: 204, headers: noStore });
    return new Response(null, { status: 200, headers: noStore });
  } catch {
    // Non-2xx makes Mercado Pago retry; settlement is idempotent per payment/order id.
    return Response.json({ code: "WEBHOOK_RETRY" }, { status: 503, headers: noStore });
  }
}
