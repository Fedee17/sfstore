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

export type StoreSaleSearchProduct = {
  name: string;
  sku: string | null;
};

const MAX_STORE_SALE_MONEY_CENTS = 999_999_999_999;

export function normalizeStoreSaleSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function matchesStoreSaleProduct(
  product: StoreSaleSearchProduct,
  query: string,
) {
  const normalizedQuery = normalizeStoreSaleSearch(query);
  if (!normalizedQuery) return false;
  return normalizeStoreSaleSearch(`${product.name} ${product.sku ?? ""}`).includes(
    normalizedQuery,
  );
}

export function parseStoreSaleUnitPrice(value: string) {
  const normalized = value.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error("El precio unitario debe tener como maximo 2 decimales.");

  const cents =
    BigInt(match[1]) * BigInt(100) +
    BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents <= BigInt(0)) {
    throw new Error("El precio unitario debe ser mayor que cero.");
  }
  if (cents > BigInt(MAX_STORE_SALE_MONEY_CENTS)) {
    throw new Error("El precio unitario supera el maximo permitido.");
  }
  return Number(cents) / 100;
}

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
