export type StoreSaleProductPrice = {
  price: number;
  transfer_price: number | null;
};

export type StoreSalePaymentInput = {
  method: "cash" | "transfer" | "card" | "other";
  amount: number;
};

export type StoreSaleDisplayItem = {
  product_name: string | null;
};

export function getStoreSaleDisplayName(
  orderNumber: string,
  items: readonly StoreSaleDisplayItem[],
) {
  const firstProductName = items[0]?.product_name?.trim();

  if (!firstProductName) {
    return orderNumber;
  }

  const additionalProducts = items.length - 1;

  if (additionalProducts === 0) {
    return firstProductName;
  }

  return `${firstProductName} + ${additionalProducts} ${
    additionalProducts === 1 ? "producto" : "productos"
  }`;
}

export function getStoreSaleUnitPrice(product: StoreSaleProductPrice) {
  return Number(product.transfer_price ?? product.price);
}

export function calculateStoreSaleTotal(
  lines: { quantity: number; unitPrice: number }[],
) {
  return Math.round(
    lines.reduce(
      (total, line) => total + line.quantity * line.unitPrice,
      0,
    ) * 100,
  ) / 100;
}

export function calculateEnteredPayments(payments: StoreSalePaymentInput[]) {
  return Math.round(
    payments.reduce((total, payment) => total + payment.amount, 0) * 100,
  ) / 100;
}
