import { hasValidWebPrice } from "@/lib/web-transfer-pricing";
import type { CommercialPrices } from "@/lib/products/commercial-pricing";

/**
 * Price pair shown on product pages. `list` covers paying in up to MAX_INSTALLMENTS installments, `cash` a single
 * payment; the saving is always their difference, never a fixed percentage.
 */
export type PaymentPrices = { list: number; cash: number };

// Published prices of a product or variant: list = products.price, cash = the database's cash price for the current
// commercial policy (services/products.ts), the same amount the cart and checkout charge.
export function getPublishedPaymentPrices(product: { price: number; transferPrice?: number | null }): PaymentPrices | null {
  const prices = { list: product.price, cash: product.transferPrice ?? Number.NaN };
  return isValidPaymentPrices(prices) ? prices : null;
}

/** Reference amounts of the approved mockup (Codex, 25/11/2026), only for the local visual comparison view. */
export const APPROVED_MOCKUP_PRICES: PaymentPrices = { list: 17700, cash: 15300 };

/** The admin calculator's proposal (commercial-pricing.ts) in the same shape: the financed price is the list price. */
export function paymentPricesFromCalculator(prices: Pick<CommercialPrices, "cashCents" | "financedCents">): PaymentPrices {
  return { list: Number(prices.financedCents) / 100, cash: Number(prices.cashCents) / 100 };
}

/** Fail closed: both amounts positive and finite, and the cash price never above the list price. */
export function isValidPaymentPrices(prices: PaymentPrices | null): prices is PaymentPrices {
  return !!prices && hasValidWebPrice(prices.list) && hasValidWebPrice(prices.cash) && prices.cash <= prices.list;
}
