// Amounts typed by the owner in the admin (local sales, customer orders, purchases). Argentine format: the dot groups
// thousands ("15.000", "1.500.000") and the comma marks decimals ("15.000,50"). A plain number may use either separator
// for up to two decimals ("15000,5", "15000.50", the value the inputs are prefilled with). Anything else returns null so
// callers reject it instead of guessing (owner report 27/11: "15.000" was read as 15 pesos).
const THOUSANDS = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/;
const PLAIN = /^(\d+)(?:[.,](\d{1,2}))?$/;

export function parseMoneyInputCents(value: string): bigint | null {
  const text = value.trim();
  const match = THOUSANDS.exec(text) ?? PLAIN.exec(text);
  if (!match) return null;
  return BigInt(match[1].replaceAll(".", "")) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
}
