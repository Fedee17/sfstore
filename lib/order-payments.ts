export const ORDER_PAYMENT_METHODS = [
  "cash",
  "transfer",
  "card",
  "mercadopago",
  "other",
] as const;

export const ORDER_PAYMENT_ENTRY_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "refunded",
] as const;

export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];
export type OrderPaymentEntryStatus =
  (typeof ORDER_PAYMENT_ENTRY_STATUSES)[number];
export type OrderPaymentStatus = "pending" | "partial" | "paid" | "refunded";

export type PaymentAmountEntry = {
  amount: number;
  status: OrderPaymentEntryStatus;
};

export type OrderPaymentSummary = {
  totalPaid: number;
  remainingAmount: number;
  paymentStatus: OrderPaymentStatus;
};

export function normalizePaymentAmount(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("El importe del pago no es valido.");
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateOrderPaymentSummary(
  orderTotal: number,
  payments: PaymentAmountEntry[],
): OrderPaymentSummary {
  const normalizedTotal = normalizePaymentAmount(orderTotal);
  const totalPaid = normalizePaymentAmount(
    payments
      .filter((payment) => payment.status === "approved")
      .reduce((total, payment) => total + payment.amount, 0),
  );
  const remainingAmount = normalizePaymentAmount(
    Math.max(normalizedTotal - totalPaid, 0),
  );

  let paymentStatus: OrderPaymentStatus = "pending";

  if (normalizedTotal > 0 && totalPaid >= normalizedTotal) {
    paymentStatus = "paid";
  } else if (totalPaid > 0) {
    paymentStatus = "partial";
  } else if (payments.some((payment) => payment.status === "refunded")) {
    paymentStatus = "refunded";
  }

  return { totalPaid, remainingAmount, paymentStatus };
}
