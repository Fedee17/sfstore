import { isDecantProduct } from "../catalog/perfume-recommendation.ts";
import { adminMoneyText, calculateListFromSpecial, parseAdminMoneyCents } from "./admin-price-calculation.ts";

export function supportsPerfumePricePolicy(category: string, name: string, type: string) {
  return category === "perfumes" && type.trim().toLowerCase() !== "accesorios"
    && !isDecantProduct({ id: "pricing", slug: "pricing", name, attributes: [{ name: "Tipo", value: type }] })
    && !isDecantProduct({ id: "pricing", slug: "pricing", name, attributes: [] });
}

export function calculatePerfumePricePolicy(cost: string) {
  const cents = parseAdminMoneyCents(cost);
  if (cents <= BigInt(0)) throw new Error("Ingresá un costo mayor a cero.");
  // Ceil(cost * 1.40 / 1000) * 1000, without floating point or intermediate rounding.
  const special = ((cents * BigInt(14) + BigInt(999999)) / BigInt(1000000)) * BigInt(100000);
  return calculateListFromSpecial(adminMoneyText(special));
}

export function assertPerfumePricePolicy(category: string, name: string, type: string, cost: number | null, list: number, special: number | null) {
  if (!supportsPerfumePricePolicy(category, name, type)) throw new Error("El cálculo del 40% corresponde únicamente a perfumes completos.");
  if (cost === null) throw new Error("Ingresá un costo válido antes de calcular.");
  const expected = calculatePerfumePricePolicy(String(cost));
  if (list !== expected.list || special !== expected.special) throw new Error("El costo o los precios cambiaron. Aplicá nuevamente el cálculo sugerido.");
}
