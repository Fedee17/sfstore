import { parseMoneyInputCents } from "./money-input.ts";

export const STORE_SALE_PAYMENT_METHODS =["cash", "transfer", "debit", "credit", "qr", "other"] as const;
export type StoreSalePaymentMethod = (typeof STORE_SALE_PAYMENT_METHODS)[number];

// Preview only: PostgreSQL re-reads and locks products before authorizing a sale.
// Round per unit, identically to the web: cashPrice is the product's charged cash price (commercial_cash_unit_price);
// without it (combos) the 75% rule applies.
export function calculateStoreSalePricing(
  lines: { price: number; quantity: number; cashPrice?: number; saleUnitPrice?: number }[],
  methods: readonly string[],
) {
  const discounted = methods.length > 0 && methods.every((method) => method === "cash" || method === "transfer");
  let subtotalCents = BigInt(0);
  let totalCents = BigInt(0);
  const items = lines.map((line) => {
    if (!Number.isFinite(line.price) || line.price <= 0 || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("Producto, precio o cantidad no válidos.");
    }
    const cents = BigInt(Math.round(line.price * 100));
    const cash = line.cashPrice !== undefined && Number.isFinite(line.cashPrice) && line.cashPrice > 0 && line.cashPrice <= line.price ? BigInt(Math.round(line.cashPrice * 100)) : null;
    const suggested = discounted ? cash ?? (cents * BigInt(75) + BigInt(50)) / BigInt(100) : cents;
    let unit = suggested;
    if (line.saleUnitPrice !== undefined) {
      unit = BigInt(Math.round(parseStoreSaleUnitPrice(String(line.saleUnitPrice)) * 100));
      if (unit < suggested) throw new Error("El precio de venta no puede ser menor al precio sugerido para ese medio de pago.");
    }
    subtotalCents += (unit > cents ? unit : cents) * BigInt(line.quantity);
    totalCents += unit * BigInt(line.quantity);
    return { unitPrice: Number(unit) / 100, subtotal: Number(unit * BigInt(line.quantity)) / 100 };
  });
  if (subtotalCents > BigInt(MAX_STORE_SALE_MONEY_CENTS) || totalCents > BigInt(MAX_STORE_SALE_MONEY_CENTS)) {
    throw new Error("El total supera el máximo permitido.");
  }
  return { discounted, subtotal: Number(subtotalCents) / 100, discount: Number(subtotalCents - totalCents) / 100, total: Number(totalCents) / 100, items };
}

export type StoreSaleProductPrice = {
  price: number;
  transfer_price: number | null;
};

export type StoreSalePaymentInput = {
  method: StoreSalePaymentMethod;
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

function parsePositiveStoreSaleMoney(value: string, label: string) {
  const cents = parseMoneyInputCents(value);
  if (cents === null) {
    throw new Error(`${label} debe escribirse como 15000 o 15.000,50, con 2 decimales como máximo.`);
  }
  if (cents <= BigInt(0)) {
    throw new Error(`${label} debe ser mayor que cero.`);
  }
  if (cents > BigInt(MAX_STORE_SALE_MONEY_CENTS)) {
    throw new Error(`${label} supera el maximo permitido.`);
  }
  return Number(cents) / 100;
}

export function parseStoreSaleUnitPrice(value: string) {
  return parsePositiveStoreSaleMoney(value, "El precio unitario");
}

export function parseStoreSalePaymentAmount(value: string) {
  return parsePositiveStoreSaleMoney(value, "El importe del pago");
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
  return calculateStoreSalePricing([{ price: product.price, quantity: 1 }], ["cash"]).items[0].unitPrice;
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
