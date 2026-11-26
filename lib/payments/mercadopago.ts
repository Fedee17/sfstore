import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { MAX_INSTALLMENTS } from "../products/commercial-pricing.ts";
import { assertPaymentMatchesOrder, fromMercadoPagoOrder, fromMercadoPagoPayment, type PayableOrder, type ReceivedPayment } from "./payment-eligibility.ts";

// Mercado Pago for web orders (owner decision 25/11/2026): Checkout Pro charges the contado total in one payment;
// Checkout API (card token from the Card Payment Brick, Orders API /v1/orders since 26/11/2026) charges the financiado
// total in 2 or 3 installments. Amounts, installments and the order reference always come from the stored order,
// never from the browser. Nothing here is reachable until MERCADOPAGO_PAYMENTS_ENABLED is set (see isMercadoPagoEnabled).

export type MercadoPagoOrder = PayableOrder & {
  expiresAt: string; // Reservation expiry (ISO 8601): the payment window never outlives the stock hold.
  description: string;
};

export function isMercadoPagoEnabled(env: Record<string, string | undefined>) {
  return env.MERCADOPAGO_PAYMENTS_ENABLED === "1" && !!env.MERCADO_PAGO_ACCESS_TOKEN && !!env.MERCADO_PAGO_WEBHOOK_SECRET;
}

const pesos = (cents: bigint) => {
  if (cents <= BigInt(0)) throw new Error("Importe inválido.");
  return Number(cents) / 100;
};

const amountText = (cents: bigint) => {
  if (cents <= BigInt(0)) throw new Error("Importe inválido.");
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
};

/** Checkout Pro preference for a contado order: one installment, no voucher/ATM methods, approve-or-reject only. */
export function contadoPreference(order: MercadoPagoOrder, siteUrl: string, orderId: string) {
  if (order.mode !== "contado") throw new Error("Checkout Pro solo cobra el precio de contado.");
  const site = new URL(siteUrl);
  if (site.protocol !== "https:") throw new Error("Mercado Pago requiere una URL https.");
  // Every return lands on the order receipt, which shows the status stored by the webhook, never the URL outcome.
  const back = new URL(`/checkout/exito?order=${encodeURIComponent(orderId)}`, site).toString();
  return {
    items: [{ id: order.reference, title: order.description, quantity: 1, unit_price: pesos(order.totalCents), currency_id: "ARS" }],
    external_reference: order.reference,
    payment_methods: {
      installments: 1, // A contado price can never be paid in installments (Ley 25.065 art. 37 c).
      default_installments: 1,
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
    },
    binary_mode: true,
    expires: true,
    expiration_date_to: order.expiresAt,
    date_of_expiration: order.expiresAt,
    notification_url: new URL("/api/mercadopago/webhook", site).toString(),
    back_urls: { success: back, pending: back, failure: back },
    auto_return: "approved",
    statement_descriptor: "SFSTORE",
  };
}

/** Closes a Checkout Pro link once its order is paid, so the same link cannot charge the order a second time. */
export const expiredPreference = (nowIso: string) => ({ expires: true, expiration_date_to: nowIso });

/**
 * Checkout API order (POST /v1/orders) for a financiado order. The browser only supplies the card token, the card
 * brand and the chosen installments; amount, reference and description come from the stored order.
 */
export function financedOrder(order: MercadoPagoOrder, card: { token: string; installments: number; paymentMethodId: string; payerEmail: string }) {
  if (order.mode !== "financiado") throw new Error("Las cuotas solo cobran el precio de lista.");
  if (!Number.isInteger(card.installments) || card.installments < 2 || card.installments > MAX_INSTALLMENTS) throw new Error("Cantidad de cuotas no habilitada.");
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(card.token) || !/^[a-z_]{2,40}$/.test(card.paymentMethodId)) throw new Error("Datos de tarjeta inválidos.");
  const amount = amountText(order.totalCents);
  return {
    body: {
      type: "online",
      processing_mode: "automatic",
      total_amount: amount,
      external_reference: order.reference,
      description: order.description,
      payer: { email: card.payerEmail },
      transactions: { payments: [{ amount, payment_method: { id: card.paymentMethodId, type: "credit_card", token: card.token, installments: card.installments, statement_descriptor: "SFSTORE" } }] },
    },
    // One charge per card token (tokens are single-use): a retried or double-submitted request cannot charge twice,
    // while a new attempt after a rejection (new token) is still possible. The database accepts one approval per order.
    idempotencyKey: `${order.reference}:${card.installments}:${createHash("sha256").update(card.token).digest("hex").slice(0, 24)}`,
  };
}

/** Checkout Pro payment ID or Orders API ID, whose webhook representation can vary in case. */
export const isMercadoPagoChargeId = (id: string) => /^(?:[0-9]{1,20}|ORD[A-Z0-9]{8,60})$/i.test(id);

/**
 * Webhook authenticity (Mercado Pago «x-signature»): HMAC-SHA256 of `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * with the account's webhook secret. The manifest preserves the case of the received data.id.
 * Old timestamps are rejected to limit replays.
 */
export function verifyWebhookSignature(input: { signature: string | null; requestId: string | null; dataId: string; secret: string; nowMs: number; toleranceMs?: number }) {
  if (!input.signature || !input.requestId || !isMercadoPagoChargeId(input.dataId)) return false;
  const parts = Object.fromEntries(input.signature.split(",").map(part => part.trim().split("=", 2) as [string, string]));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !v1 || !/^\d{10,13}$/.test(ts) || !/^[0-9a-f]{64}$/.test(v1)) return false;
  const tsMs = ts.length === 10 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(input.nowMs - tsMs) > (input.toleranceMs ?? 5 * 60 * 1000)) return false;
  const expected = createHmac("sha256", input.secret).update(`id:${input.dataId};request-id:${input.requestId};ts:${ts};`).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}

export type MercadoPagoPaymentRecord = {
  id: number;
  status: string;
  payment_type_id: string;
  installments: number;
  transaction_amount: number;
  currency_id: string;
  external_reference: string;
};

/** GET /v1/orders/{id} (Orders API). Amounts are decimal strings; paid_amount includes any interest Mercado Pago adds. */
export type MercadoPagoOrderRecord = {
  id: string;
  status: string;
  status_detail: string;
  external_reference: string;
  total_amount: string;
  currency: string;
  transactions?: { payments?: { id: string; amount: string; paid_amount?: string; status: string; status_detail: string;
    payment_method: { id: string; type: string; installments: number } }[] };
};

export type SettlementOutcome = "approved" | "review" | "pending" | "rejected";
export type SettlementDeps = {
  loadOrder: (reference: string) => Promise<MercadoPagoOrder | null>;
  // The database decides: "approved", or "review" when the order can no longer take it (already paid, expired…).
  approve: (input: { reference: string; providerPaymentId: string; amountCents: bigint; installments: number; method: string }) => Promise<"approved" | "review">;
  // amountCents: what Mercado Pago charged, when readable, so the administrator knows what a refund would return.
  review: (input: { reference: string | null; providerPaymentId: string; reason: string; amountCents: bigint | null }) => Promise<void>;
};
type Charge = { status: "approved" | "pending" | "rejected"; reference: string; received: () => ReceivedPayment };

/**
 * Settles a charge read back from Mercado Pago (the only source of truth). The order is confirmed only when Mercado Pago
 * reports it approved and the method, installments, currency, reference and amount match the stored order exactly;
 * anything else goes to manual review (and, when charged, to a refund decision) without confirming. Infrastructure
 * failures propagate (the webhook answers non-2xx and Mercado Pago retries); only real mismatches become reviews.
 */
async function settleCharge(providerId: string, charge: Charge, deps: SettlementDeps): Promise<SettlementOutcome> {
  if (charge.status !== "approved") return charge.status; // Not charged: the reservation simply runs its course.
  let received: ReceivedPayment | null = null;
  let mismatch: unknown = null;
  try { received = charge.received(); } catch (error) { mismatch = error; }
  const amountCents = received?.amountCents ?? null;
  const order = charge.reference ? await deps.loadOrder(charge.reference) : null;
  if (!order) {
    await deps.review({ reference: null, providerPaymentId: providerId, reason: "Pago aprobado sin pedido asociado.", amountCents });
    return "review";
  }
  try {
    if (!received) throw mismatch;
    assertPaymentMatchesOrder(order, received);
  } catch (error) {
    await deps.review({ reference: order.reference, providerPaymentId: providerId, reason: error instanceof Error ? error.message : "Pago no coincidente.", amountCents });
    return "review";
  }
  return deps.approve({ reference: order.reference, providerPaymentId: providerId, amountCents: received.amountCents, installments: received.installments, method: received.method });
}

const REJECTED_PAYMENT = new Set(["rejected", "cancelled", "refunded", "charged_back"]);
/** Checkout Pro payment (GET /v1/payments/{id}). */
export async function settleMercadoPagoPayment(paymentId: string, deps: SettlementDeps & { fetchPayment: (id: string) => Promise<MercadoPagoPaymentRecord> }) {
  if (!/^\d{1,20}$/.test(paymentId)) throw new Error("Pago inválido.");
  const payment = await deps.fetchPayment(paymentId);
  if (String(payment.id) !== paymentId) throw new Error("Respuesta de Mercado Pago inconsistente.");
  const status = payment.status === "approved" ? "approved" : REJECTED_PAYMENT.has(payment.status) ? "rejected" : "pending";
  return settleCharge(paymentId, { status, reference: payment.external_reference, received: () => fromMercadoPagoPayment(payment) }, deps);
}

const REJECTED_ORDER = new Set(["failed", "canceled", "expired", "refunded"]);
/** Checkout API order (GET /v1/orders/{id}). Approved means processed/accredited; failed, canceled or expired means not charged. */
export async function settleMercadoPagoOrder(orderId: string, deps: SettlementDeps & { fetchOrder: (id: string) => Promise<MercadoPagoOrderRecord> }) {
  if (!/^ORD[A-Z0-9]{8,60}$/.test(orderId)) throw new Error("Orden inválida.");
  const order = await deps.fetchOrder(orderId);
  if (order.id !== orderId) throw new Error("Respuesta de Mercado Pago inconsistente.");
  const status = order.status === "processed" && order.status_detail === "accredited" ? "approved" : REJECTED_ORDER.has(order.status) ? "rejected" : "pending";
  return settleCharge(orderId, { status, reference: order.external_reference, received: () => fromMercadoPagoOrder(order) }, deps);
}
