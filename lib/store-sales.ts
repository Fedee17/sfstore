export type StoreSaleProductPrice = {
  price: number;
  transfer_price: number | null;
};

export type StoreSalePaymentInput = {
  method: "cash" | "transfer" | "card" | "other";
  amount: number;
};

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
