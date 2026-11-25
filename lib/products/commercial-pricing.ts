import { parseAdminMoneyCents } from "./admin-price-calculation.ts";

// Every suggested price covers cost, direct selling costs and the desired profit after collection costs.
// One-payment methods share the cash price (Ley 25.065 art. 37 c,
// Res. 51/2017 art. 1); only credit card in 2-3 installments uses the financed price. Integer cents and ppm only.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const PPM = BigInt(1000000);
const IVA_PPM = BigInt(210000);
export const MAX_INSTALLMENTS = 3;

export type CollectionCost = {
  id: string;
  label: string;
  commissionPpm: bigint; // Provider commission without IVA.
  ivaOnCommission: boolean; // Non-registered seller: IVA on the commission is a definitive cost.
  confirmed: boolean; // False until the owner's Mercado Pago account shows the exact value.
  source: string;
};

export type PaymentCostTable = {
  cash: CollectionCost[]; // Every enabled one-payment method; the most expensive one sets the cash price.
  financed: CollectionCost[]; // Every enabled installment count; the most expensive one sets the financed price.
};

// Mercado Pago, money released at 35 days, Córdoba (/ayuda/33399, from 06/03/2026): 1,56% + IVA = 1,8876%,
// matching the ≈1,89% the owner's account simulator shows. Seller-paid installments add 7,79% (2) or 10,49% (3)
// + IVA (/developers/es/support/cuotas-sin-interes_3299, from 10/02/2026); the account value is still unconfirmed.
// Automated transfer is excluded until a provider is approved: add its row to `cash` when it is.
export const SFSTORE_PAYMENT_COSTS: PaymentCostTable = {
  cash: [
    { id: "cash", label: "Efectivo al retirar", commissionPpm: ZERO, ivaOnCommission: false, confirmed: true, source: "Sin proveedor" },
    { id: "mercadopago-1", label: "Mercado Pago en 1 pago (dinero en cuenta, débito o crédito)", commissionPpm: BigInt(15600), ivaOnCommission: true, confirmed: true, source: "Mercado Pago, Córdoba, 35 días (/ayuda/33399) y simulador de la cuenta" },
  ],
  financed: [
    { id: "mercadopago-2", label: "Crédito en 2 cuotas", commissionPpm: BigInt(15600 + 77900), ivaOnCommission: true, confirmed: false, source: "1,56% a 35 días + 7,79% por 2 cuotas (cuotas-sin-interes_3299)" },
    { id: "mercadopago-3", label: "Crédito en 3 cuotas", commissionPpm: BigInt(15600 + 104900), ivaOnCommission: true, confirmed: false, source: "1,56% a 35 días + 10,49% por 3 cuotas (cuotas-sin-interes_3299)" },
  ],
};

const CASH_STEP = BigInt(10000); // D8: round up to $100.
const FINANCED_STEP = BigInt(30000); // Round up to $300 so 2 and 3 installments are whole pesos.

export function effectiveRatePpm(cost: CollectionCost) {
  if (cost.commissionPpm < ZERO || cost.commissionPpm >= PPM) throw new Error("Comisión inválida: " + cost.label + ".");
  // Round the IVA up so the price never covers less than the real cost.
  return cost.commissionPpm + (cost.ivaOnCommission ? (cost.commissionPpm * IVA_PPM + PPM - ONE) / PPM : ZERO);
}

function feeCents(priceCents: bigint, ratePpm: bigint) {
  return (priceCents * ratePpm + PPM / BigInt(2)) / PPM;
}

function maxRate(costs: CollectionCost[]) {
  if (costs.length === 0) throw new Error("Falta al menos un medio de cobro habilitado.");
  return costs.map(effectiveRatePpm).reduce((a, b) => (a > b ? a : b));
}

// The doubled amount preserves the historical half-cent precision when callers use the default profit.
function priceFor(doubledTarget: bigint, sellingPpm: bigint, ratePpm: bigint, step: bigint) {
  const keep = PPM - sellingPpm - ratePpm;
  if (keep <= ZERO) throw new Error("Los costos porcentuales superan el 100% del precio.");
  const numerator = doubledTarget * PPM;
  const denominator = BigInt(2) * keep * step;
  return ((numerator + denominator - ONE) / denominator) * step;
}

export type ModalityResult = { id: string; label: string; priceCents: bigint; feeCents: bigint; sellingCents: bigint; profitCents: bigint; confirmed: boolean };

export function evaluateCommercialPrice(
  priceCents: bigint,
  costs: CollectionCost[],
  { costCents, fixedCents, sellingPpm }: Pick<CommercialPrices, "costCents" | "fixedCents" | "sellingPpm">,
): ModalityResult[] {
  return costs.map(cost => {
    const fee = feeCents(priceCents, effectiveRatePpm(cost));
    const selling = feeCents(priceCents, sellingPpm) + fixedCents;
    return {
      id: cost.id, label: cost.label, priceCents, feeCents: fee, sellingCents: selling,
      profitCents: priceCents - fee - selling - costCents, confirmed: cost.confirmed,
    };
  });
}

export type CommercialPrices = {
  costCents: bigint;
  fixedCents: bigint;
  sellingPpm: bigint;
  cashRatePpm: bigint;
  financedRatePpm: bigint;
  cashCents: bigint;
  financedCents: bigint;
  installmentCents: bigint; // Value of each of the MAX_INSTALLMENTS installments.
  differencePpm: bigint; // financed / cash − 1.
  modalities: ModalityResult[];
};

// `fixedCost` and `sellingCostPpm` are the owner's direct selling costs (G1/G2). Pass "0" / 0 explicitly while
// they are unconfirmed; this function never assumes a value.
export function calculateCommercialPrices(
  input: { cost: string; fixedCost: string; sellingCostPpm: bigint; desiredProfitCents?: bigint },
  table: PaymentCostTable = SFSTORE_PAYMENT_COSTS,
): CommercialPrices {
  const costCents = parseAdminMoneyCents(input.cost);
  const fixedCents = parseAdminMoneyCents(input.fixedCost);
  if (costCents <= ZERO) throw new Error("Ingresá un costo mayor a cero.");
  if (input.sellingCostPpm < ZERO || input.sellingCostPpm >= PPM) throw new Error("Los gastos de venta porcentuales son inválidos.");
  const twice = BigInt(2);
  const profit = input.desiredProfitCents;
  if (profit !== undefined && profit < ZERO) throw new Error("Ingresá una ganancia no negativa.");
  const doubledTarget = twice * (costCents + fixedCents) + (profit === undefined ? costCents : twice * profit);
  const cashRatePpm = maxRate(table.cash);
  const financedRatePpm = maxRate(table.financed);
  const cashCents = priceFor(doubledTarget, input.sellingCostPpm, cashRatePpm, CASH_STEP);
  const financedRaw = priceFor(doubledTarget, input.sellingCostPpm, financedRatePpm, FINANCED_STEP);
  // The financed price can never be below the cash price (it would undercut the one-payment price).
  const financedCents = financedRaw >= cashCents ? financedRaw : ((cashCents + FINANCED_STEP - ONE) / FINANCED_STEP) * FINANCED_STEP;
  const costs = { costCents, fixedCents, sellingPpm: input.sellingCostPpm };
  return {
    costCents, fixedCents, sellingPpm: input.sellingCostPpm, cashRatePpm, financedRatePpm, cashCents, financedCents,
    installmentCents: financedCents / BigInt(MAX_INSTALLMENTS),
    differencePpm: ((financedCents - cashCents) * PPM + cashCents / BigInt(2)) / cashCents,
    modalities: [
      ...evaluateCommercialPrice(cashCents, table.cash, costs),
      ...evaluateCommercialPrice(financedCents, table.financed, costs),
    ],
  };
}

// Costo financiero total efectivo anual (Res. 4/2025, art. 2 d): monthly rate i solving
// cash = installment · Σ(1+i)^−k, annualized as (1+i)^12 − 1. Display value with two decimals.
export function financedCftea(cashCents: bigint, financedCents: bigint, installments: number) {
  if (!Number.isInteger(installments) || installments < 2 || installments > MAX_INSTALLMENTS) throw new Error("Cantidad de cuotas inválida.");
  if (financedCents < cashCents) throw new Error("El precio financiado no puede ser menor que el de contado.");
  const cash = Number(cashCents), installment = Number(financedCents) / installments;
  if (financedCents === cashCents) return 0;
  const present = (i: number) => { let sum = 0; for (let k = 1; k <= installments; k++) sum += installment / (1 + i) ** k; return sum; };
  let low = 0, high = 1;
  for (let step = 0; step < 200; step++) { const mid = (low + high) / 2; if (present(mid) > cash) low = mid; else high = mid; }
  return Math.round(((1 + (low + high) / 2) ** 12 - 1) * 10000) / 100;
}
