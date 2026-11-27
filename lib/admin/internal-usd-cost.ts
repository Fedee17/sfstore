export type MepQuote = { rate: number; updatedAt: string };

const rateScale = 10_000;

export function parseUsdCost(value: string) {
  const amount = value.trim();
  if (!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(amount) || Number(amount.replace(",", ".")) === 0) {
    throw new Error("Ingresá un costo en USD mayor a cero, con hasta dos decimales.");
  }
  return Number(amount.replace(",", "."));
}

export function parseProfitPercent(value: string) {
  const percent = value.trim();
  if (percent === "") return null;
  if (!/^\d{1,7}(?:[.,]\d{1,4})?$/.test(percent)) {
    throw new Error("Ingresá una ganancia válida con hasta cuatro decimales.");
  }
  return Number(percent.replace(",", "."));
}

export async function fetchMepQuote(request: typeof fetch = fetch): Promise<MepQuote | null> {
  try {
    const response = await request("https://dolarapi.com/v1/dolares/bolsa", {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const quote = await response.json();
    if (quote?.moneda !== "USD" || quote.casa !== "bolsa" ||
      typeof quote.venta !== "number" || quote.venta < 0.0001 || quote.venta > 999_999 ||
      typeof quote.fechaActualizacion !== "string" || !Number.isFinite(Date.parse(quote.fechaActualizacion))) return null;
    return { rate: quote.venta, updatedAt: quote.fechaActualizacion };
  } catch {
    return null;
  }
}

export function usdCostInArs(amount: number, quote: Pick<MepQuote, "rate">) {
  const usdCents = BigInt(Math.round(amount * 100));
  const rate = BigInt(Math.round(quote.rate * rateScale));
  return (usdCents * rate + BigInt(rateScale / 2)) / BigInt(rateScale);
}
