import { moneyCents } from "../commercial-reporting/money.ts";
import { getEffectiveCashPrice, getWebTransferPrice } from "../web-transfer-pricing.ts";
import { isSupersededYaraRosa } from "../products/yara-rosa-consolidation.ts";

/** Owner decision 27/11/2026: list and approved special move by the same percentage, rounded to the nearest $100. */
export const BULK_PRICE_LIMIT = 100;
export const BULK_PRICE_MIN_BP = -5000;
export const BULK_PRICE_MAX_BP = 10000;
const STEP_CENTS = 10000;

export type BulkPriceRow = {
  id: string; name: string; sku?: string | null; slug: string; status: string; historical_identity: boolean | null;
  family_id: string | null; price: number | string; transfer_price: number | string | null;
  cash_price_approved_at: string | null; compare_at_price: number | string | null;
};
export type PriceMove = { fromCents: number; exactCents: number; toCents: number; roundingCents: number };
export type BulkPriceChange = {
  row: BulkPriceRow; list: PriceMove;
  special: ({ approved: true } & PriceMove) | { approved: false; fromCents: number; toCents: number };
};
export type BulkPricePlan = { change: BulkPriceChange[]; skip: { row: BulkPriceRow; reason: string }[]; tooMany: boolean; roundingCents: number };

/** Percentage in basis points (10 → 1000), up to two decimals, between -50% and +100%, never 0. */
export function parsePercent(value: unknown): number | null {
  const match = typeof value === "string" ? /^(-)?(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(value.trim()) : null;
  if (!match) return null;
  const bp = (Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"))) * (match[1] ? -1 : 1);
  return bp !== 0 && bp >= BULK_PRICE_MIN_BP && bp <= BULK_PRICE_MAX_BP ? bp : null;
}

/** Nearest $100, halves up (amounts are never negative). */
export function roundTo100(cents: number) {
  return Math.floor((cents + STEP_CENTS / 2) / STEP_CENTS) * STEP_CENTS;
}

function move(fromCents: number, bp: number): PriceMove {
  const exactCents = Number((BigInt(fromCents) * BigInt(10000 + bp) + BigInt(5000)) / BigInt(10000));
  const toCents = roundTo100(exactCents);
  return { fromCents, exactCents, toCents, roundingCents: toCents - exactCents };
}
const cents = (value: number | string) => moneyCents(typeof value === "number" ? value.toFixed(2) : value);

/** The same rules decide the preview and, re-read from the database, the write. */
export function planBulkPrice(rows: BulkPriceRow[], bp: number, presentationIds: ReadonlySet<string>): BulkPricePlan {
  const plan: BulkPricePlan = { change: [], skip: [], tooMany: false, roundingCents: 0 };
  for (const row of rows) {
    const skip = (reason: string) => { plan.skip.push({ row, reason }); };
    if (row.historical_identity !== false) { skip("Identidad histórica: no admite cambios"); continue; }
    if (isSupersededYaraRosa(row)) { skip("Se conserva sólo para trazabilidad"); continue; }
    if (row.family_id) { skip("Variante de familia: el precio se ajusta en la familia"); continue; }
    if (presentationIds.has(row.id)) { skip("Combo de cargador: el precio sale de sus componentes"); continue; }
    const listFrom = cents(row.price);
    if (listFrom <= 0) { skip("Sin precio de lista"); continue; }
    const list = move(listFrom, bp);
    if (list.toCents <= 0) { skip("El precio quedaría en $0 al redondear"); continue; }
    if (row.compare_at_price !== null && cents(row.compare_at_price) > 0 && list.toCents >= cents(row.compare_at_price)) {
      skip("El precio tachado quedaría menor o igual a la lista"); continue;
    }
    const approved = row.cash_price_approved_at !== null && row.transfer_price !== null
      && getEffectiveCashPrice({ price: row.price, transfer_price: row.transfer_price, cash_price_approved_at: row.cash_price_approved_at }) === Number(row.transfer_price);
    let special: BulkPriceChange["special"];
    if (approved) {
      const moved = move(cents(row.transfer_price!), bp);
      if (moved.toCents <= 0 || moved.toCents > list.toCents) { skip("El precio especial quedaría mayor que la lista o en $0"); continue; }
      special = { approved: true, ...moved };
    } else {
      special = { approved: false, fromCents: Math.round(getWebTransferPrice(Number(row.price)) * 100), toCents: Math.round(getWebTransferPrice(list.toCents / 100) * 100) };
    }
    if (list.toCents === list.fromCents && (!special.approved || special.toCents === special.fromCents)) { skip("Con el redondeo el precio queda igual"); continue; }
    plan.roundingCents += list.roundingCents + (special.approved ? special.roundingCents : 0);
    plan.change.push({ row, list, special });
  }
  plan.tooMany = plan.change.length > BULK_PRICE_LIMIT;
  return plan;
}
