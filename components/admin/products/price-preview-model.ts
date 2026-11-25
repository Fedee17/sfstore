import { adminMoneyText, parseAdminMoneyCents } from "@/lib/products/admin-price-calculation";
import { calculateCommercialPrices, effectiveRatePpm, evaluateCommercialPrice, SFSTORE_PAYMENT_COSTS } from "@/lib/products/commercial-pricing";
import type { PaymentCostTable } from "@/lib/products/commercial-pricing";

const zero = BigInt(0);
const ppm = BigInt(1_000_000);
const percentScale = BigInt(10_000);
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 });

export const money = (cents: bigint) => currency.format(Number(cents) / 100);
export const percent = (value: number) => decimal.format(value) + "%";
export type PricePair = { list: string; cash: string };
export type ProfitInput = { unit: "money" | "percent"; value: string };
type CostInputs = {
  purchase: string;
  acquisition: string;
  selling: string;
};
type PaymentInputs = {
  transferRate: string;
  overrides: Partial<PricePair>;
};

function readMoney(value: string) {
  const trimmed = value.trim();
  const grouped = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(trimmed);
  return parseAdminMoneyCents(grouped ? trimmed.replaceAll(".", "") : trimmed);
}

function optionalMoney(value: string) {
  return value.trim() ? readMoney(value) : zero;
}

function readPercent(value: string) {
  const match = /^(\d{1,7})(?:[.,](\d{1,4}))?$/.exec(value.trim());
  if (!match) throw new Error("Ingresá un porcentaje válido con hasta cuatro decimales.");
  return BigInt(match[1]) * percentScale + BigInt((match[2] ?? "").padEnd(4, "0"));
}

function paymentCosts(transferRate: string): PaymentCostTable {
  if (!transferRate.trim()) return SFSTORE_PAYMENT_COSTS;
  const commissionPpm = readPercent(transferRate);
  if (commissionPpm >= ppm) throw new Error("La comisión de transferencia debe ser menor al 100%.");
  return {
    ...SFSTORE_PAYMENT_COSTS,
    cash: [...SFSTORE_PAYMENT_COSTS.cash, {
      id: "transfer",
      label: "Transferencia",
      commissionPpm,
      ivaOnCommission: false,
      confirmed: false,
      source: "Tarifa final ingresada para la simulación",
    }],
  };
}

export function readCosts(input: CostInputs) {
  const base = optionalMoney(input.purchase) + optionalMoney(input.acquisition);
  const fixed = optionalMoney(input.selling);
  return { base, fixed, total: base + fixed };
}

export function profitTarget(total: bigint, input: ProfitInput) {
  const cents = input.unit === "money"
    ? readMoney(input.value)
    : (total * readPercent(input.value) + ppm / BigInt(2)) / ppm;
  const counterpart = input.unit === "percent" ? adminMoneyText(cents) : total > zero
    ? decimal.format(Number((cents * BigInt(100) * percentScale + total / BigInt(2)) / total) / Number(percentScale))
    : "";
  return { cents, counterpart };
}

export function makePricePreview(input: PaymentInputs, { base, fixed }: ReturnType<typeof readCosts>, profit: bigint) {
  const table = paymentCosts(input.transferRate);
  const suggested = calculateCommercialPrices({
    cost: adminMoneyText(base),
    fixedCost: adminMoneyText(fixed),
    sellingCostPpm: zero,
    desiredProfitCents: profit,
  }, table);
  adminMoneyText(suggested.financedCents);
  adminMoneyText(suggested.cashCents);

  function priceGroup(key: keyof PricePair, suggestion: bigint, costs: PaymentCostTable["cash"]) {
    const override = input.overrides[key];
    let price: bigint | null = suggestion;
    try {
      if (override !== undefined) {
        price = readMoney(override);
        if (price === zero) price = null;
      }
    } catch {
      price = null;
    }
    const results = price === null ? [] : evaluateCommercialPrice(price, costs, suggested);
    const limitingCost = costs.reduce((highest, method) => effectiveRatePpm(method) > effectiveRatePpm(highest) ? method : highest);
    const limitingMethod = results.find(method => method.id === limitingCost.id);
    return { suggestion, price, results, limitingMethod, provisional: costs.some(cost => !cost.confirmed) };
  }

  return {
    list: priceGroup("list", suggested.financedCents, table.financed),
    cash: priceGroup("cash", suggested.cashCents, table.cash),
    profit,
  };
}

export type PricePreview = ReturnType<typeof makePricePreview>;
