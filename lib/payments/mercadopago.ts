import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { MAX_INSTALLMENTS } from "../products/commercial-pricing.ts";
import { assertPaymentMatchesOrder, fromMercadoPagoPayment, type PayableOrder } from "./payment-eligibility.ts";

// Mercado Pago for web orders (owner decision 25/11/2026): Checkout Pro charges the contado total in one payment;
// Checkout API (card token from the Card Payment Brick) charges the financiado total in 2 or 3 installments.
// Amounts, installments and the order reference always come from the stored order, never from the browser.
// Nothing here is reachable until MERCADOPAGO_PAYMENTS_ENABLED is set (see isMercadoPagoEnabled).

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

/** Checkout API payment for a financiado order. The browser only supplies the card token and the chosen installments. */
export function financedPayment(order: MercadoPagoOrder, card: { token: string; installments: number; paymentMethodId: string; issuerId?: string; payerEmail: string }) {
  if (order.mode !== "financiado") throw new Error("Las cuotas solo cobran el precio de lista.");
  if (!Number.isInteger(card.installments) || card.installments < 2 || card.installments > MAX_INSTALLMENTS) throw new Error("Cantidad de cuotas no habilitada.");
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(card.token) || !/^[a-z_]{2,40}$/.test(card.paymentMethodId)) throw new Error("Datos de tarjeta inválidos.");
  if (card.issuerId !== undefined && !/^\d{1,12}$/.test(card.issuerId)) throw new Error("Emisor inválido.");
  return {
    body: {
      transaction_amount: pesos(order.totalCents),
      installments: card.installments,
      token: card.token,
      payment_method_id: card.paymentMethodId,
      ...(card.issuerId ? { issuer_id: Number(card.issuerId) } : {}),
      payer: { email: card.payerEmail },
      external_reference: order.reference,
      description: order.description,
      binary_mode: true,
      statement_descriptor: "SFSTORE",
    },
    // One charge per card token (tokens are single-use): a retried or double-submitted request cannot charge twice,
    // while a new attempt after a rejection (new token) is still possible. The database accepts one approval per order.
    idempotencyKey: `${order.reference}:${card.installments}:${createHash("sha256").update(card.token).digest("hex").slice(0, 24)}`,
  };
}

/**
 * Webhook authenticity (Mercado Pago «x-signature»): HMAC-SHA256 of `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * with the account's webhook secret. Old timestamps are rejected to limit replays.
 */
export function verifyWebhookSignature(input: { signature: string | null; requestId: string | null; dataId: string; secret: string; nowMs: number; toleranceMs?: number }) {
  if (!input.signature || !input.requestId || !/^\d{1,20}$/.test(input.dataId)) return false;
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

export type SettlementDeps = {
  fetchPayment: (paymentId: string) => Promise<MercadoPagoPaymentRecord>; // GET /v1/payments/{id}: the only source of truth.
  loadOrder: (reference: string) => Promise<MercadoPagoOrder | null>;
  approve: (input: { reference: string; providerPaymentId: string; amountCents: bigint; installments: number; method: string }) => Promise<void>;
  review: (input: { reference: string | null; providerPaymentId: string; reason: string }) => Promise<void>;
};

/**
 * Settles a notified payment. The order is confirmed only when Mercado Pago reports it approved and the method,
 * installments, currency, reference and amount match the stored order exactly; anything else goes to manual review
 * (and, when charged, to a refund decision) without confirming.
 */
export async function settleMercadoPagoPayment(paymentId: string, deps: SettlementDeps): Promise<"approved" | "review" | "ignored"> {
  if (!/^\d{1,20}$/.test(paymentId)) throw new Error("Pago inválido.");
  const payment = await deps.fetchPayment(paymentId);
  if (String(payment.id) !== paymentId) throw new Error("Respuesta de Mercado Pago inconsistente.");
  if (payment.status !== "approved") return "ignored"; // binary_mode: rejected payments leave the reservation to expire.
  const order = payment.external_reference ? await deps.loadOrder(payment.external_reference) : null;
  if (!order) {
    await deps.review({ reference: null, providerPaymentId: paymentId, reason: "Pago aprobado sin pedido asociado." });
    return "review";
  }
  try {
    const received = fromMercadoPagoPayment(payment);
    assertPaymentMatchesOrder(order, received);
    await deps.approve({ reference: order.reference, providerPaymentId: paymentId, amountCents: received.amountCents, installments: received.installments, method: received.method });
    return "approved";
  } catch (error) {
    await deps.review({ reference: order.reference, providerPaymentId: paymentId, reason: error instanceof Error ? error.message : "Pago no coincidente." });
    return "review";
  }
}
