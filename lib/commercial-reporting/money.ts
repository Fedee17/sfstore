import type { Money } from "./contracts.ts";
/** Exact cents; never round historic values or convert NULL to zero. */
export function moneyCents(value: Money): number {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("COMMERCIAL_INVALID_MONEY");
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("COMMERCIAL_MONEY_OVERFLOW");
  return result;
}
export function sumCents(values: readonly number[]): number {
  return values.reduce((a, b) => {
    const result = a + b;
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(result)) {
      throw new Error("COMMERCIAL_MONEY_OVERFLOW");
    }
    return result;
  }, 0);
}
