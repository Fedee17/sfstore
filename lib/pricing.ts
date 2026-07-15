export type PaymentMethod = "transfer" | "mercadopago";

export type PricedItem = {
  price: number;
  transferPrice?: number | null;
  quantity: number;
};

type PriceLike = Pick<PricedItem, "price" | "transferPrice">;

export function getTransferUnitPrice(item: PriceLike) {
  return item.transferPrice ?? item.price;
}

export function getPreferredPrice(item: PriceLike) {
  return getTransferUnitPrice(item);
}

export function getListPrice(item: Pick<PricedItem, "price">) {
  return item.price;
}

export function getUnitPriceForPayment(
  item: PriceLike,
  paymentMethod: PaymentMethod,
) {
  return paymentMethod === "transfer" ? getTransferUnitPrice(item) : item.price;
}

export function hasTransferPrice(item: PriceLike) {
  return item.transferPrice !== null && item.transferPrice !== undefined;
}

export function getSavingsPercent(price: number, transferPrice?: number | null) {
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(transferPrice ?? Number.NaN) ||
    price <= 0 ||
    transferPrice === null ||
    transferPrice === undefined ||
    transferPrice >= price
  ) {
    return null;
  }

  const percent = Math.round(((price - transferPrice) / price) * 100);

  return percent >= 5 ? percent : null;
}

export function formatSavingsLabel(
  price: number,
  transferPrice?: number | null,
) {
  const percent = getSavingsPercent(price, transferPrice);

  return percent === null ? null : `${percent}% de ahorro`;
}

export function calculatePricing(
  items: PricedItem[],
  paymentMethod: PaymentMethod,
) {
  const subtotal = items.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
  const total = items.reduce(
    (sum, item) =>
      sum + getUnitPriceForPayment(item, paymentMethod) * item.quantity,
    0,
  );

  return {
    subtotal,
    discount: Math.max(0, subtotal - total),
    total,
  };
}
