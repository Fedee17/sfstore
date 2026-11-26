// Public web pricing only. Stored transfer prices remain unchanged for internal workflows.
// Reuse the monetary bounds/rounding below without treating a missing price as free.
export function hasValidWebPrice(price: unknown): price is number {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return false;
  try { return getWebTransferPrice(price) > 0; } catch { return false; }
}

// Match PostgreSQL round(price * 0.75, 2) for nonnegative NUMERIC(12,2) prices.
export function getWebTransferPrice(price: number): number {
  const cents = Math.round(price * 100);
  if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(cents * 75 + 50)) {
    throw new Error("Invalid web list price");
  }
  return Math.floor((cents * 75 + 50) / 100) / 100;
}

// Mirror of PostgreSQL commercial_cash_unit_price (migration 202611260001): the cash price saved with the admin
// calculator once approved, otherwise round(list × 0,75, 2). Admin/server reads; the storefront reads the
// public_catalog_cash_prices view.
export function getEffectiveCashPrice(product: { price: number | string; transfer_price: number | string | null; cash_price_approved_at?: string | null }): number {
  const list = Number(product.price), stored = product.transfer_price === null ? Number.NaN : Number(product.transfer_price);
  if (product.cash_price_approved_at && Number.isFinite(stored) && stored > 0 && stored <= list && Number.isInteger(Math.round(stored * 100)) && Math.abs(Math.round(stored * 100) - stored * 100) < 1e-6) return stored;
  return getWebTransferPrice(list);
}

// Cash subtotal of cart lines from their catalog cash price. A line without one fails instead of guessing.
export function getWebTransferSubtotal(items: { transferPrice?: number | null; quantity: number }[]): number {
  return items.reduce((cents, item) => {
    if (!hasValidWebPrice(item.transferPrice)) throw new Error("Cart line without cash price");
    return cents + Math.round(item.transferPrice * 100) * item.quantity;
  }, 0) / 100;
}

const wholePesoFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

// Round the displayed cent amount up without changing the amount used for payment.
export function formatWebPrice(price: number): string {
  return wholePesoFormatter.format(Math.ceil(Math.round(price * 100) / 100));
}

// Owner decision 20/11: the buyer pays the exact amount, a few cents below the rounded-up one shown in the cart;
// checkout names that gap «Descuento por redondeo». Same rounding as formatWebPrice.
export function getWebRoundingDiscount(items: { transferPrice?: number | null; quantity: number }[]): number {
  const cents = Math.round(getWebTransferSubtotal(items) * 100);
  return (Math.ceil(cents / 100) * 100 - cents) / 100;
}
