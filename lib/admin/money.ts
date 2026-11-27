// One admin money format: exact pesos with cents (es-AR), so every screen shows the same amount.
const formatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function adminMoney(value: number | string): string {
  return formatter.format(Number(value));
}

export function adminMoneyFromCents(cents: number): string {
  return formatter.format(cents / 100);
}
