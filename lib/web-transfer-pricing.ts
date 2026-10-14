// Public web pricing only. Stored transfer prices remain unchanged for internal workflows.
// Match PostgreSQL round(price * 0.75, 2) for nonnegative NUMERIC(12,2) prices.
export function getWebTransferPrice(price: number): number {
  const cents = Math.round(price * 100);
  if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(cents * 75 + 50)) {
    throw new Error("Invalid web list price");
  }
  return Math.floor((cents * 75 + 50) / 100) / 100;
}

export function getWebTransferSubtotal(items: { price: number; quantity: number }[]): number {
  return items.reduce((cents, item) => cents + Math.round(getWebTransferPrice(item.price) * 100) * item.quantity, 0) / 100;
}
