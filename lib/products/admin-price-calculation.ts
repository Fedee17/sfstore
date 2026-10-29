import { getWebTransferPrice } from "../web-transfer-pricing.ts";

const MAX_CENTS = BigInt(999999999999); // NUMERIC(12,2), identical to existing storage.

export function parseAdminMoneyCents(value: string): bigint {
  const match = /^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("Ingresá un importe no negativo con hasta dos decimales.");
  const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > MAX_CENTS) throw new Error("El importe supera el máximo permitido.");
  return cents;
}

export function adminMoneyText(cents: bigint): string {
  if (cents < BigInt(0) || cents > MAX_CENTS) throw new Error("El importe supera el máximo permitido.");
  return String(cents / BigInt(100)) + "." + String(cents % BigInt(100)).padStart(2, "0");
}

export function calculateListFromSpecial(value: string) {
  const specialCents = parseAdminMoneyCents(value);
  if (specialCents === BigInt(0)) throw new Error("El precio especial debe ser mayor a cero para calcular la lista.");
  // round(special * 4 / 3), performed entirely in integer cents.
  const listText = adminMoneyText((specialCents * BigInt(4) + BigInt(1)) / BigInt(3));
  const specialText = adminMoneyText(specialCents);
  if (Math.round(getWebTransferPrice(Number(listText)) * 100) !== Number(specialCents)) {
    throw new Error("El precio calculado no coincide con el importe por transferencia.");
  }
  return { listText, specialText, list: Number(listText), special: Number(specialText) };
}

export function suggestSpecialFromCost(value: string): string | null {
  if (!value.trim()) return null;
  return adminMoneyText((parseAdminMoneyCents(value) * BigInt(3) + BigInt(1)) / BigInt(2));
}

export function assertCalculatedListPrice(list: number, special: number | null) {
  if (special === null) throw new Error("Completá el precio especial antes de aplicar el cálculo.");
  const expected = calculateListFromSpecial(String(special));
  if (list !== expected.list) throw new Error("El precio de lista cambió. Revisá y aplicá nuevamente el cálculo.");
}
