import type { Product } from "../../types/product.ts";
import { publicationAvailable } from "../products/public-families.ts";
import { cardCashPrice, hasValidWebPrice } from "../web-transfer-pricing.ts";

/** Order complete, filtered publications without mutating their data or shared source order. */
export function availableFirst<T extends Product>(products: readonly T[]): T[] {
  return [...products].sort(recommendedOrder);
}

function recommendedOrder(a: Product, b: Product) {
  return Number(publicationAvailable(b)) - Number(publicationAvailable(a)) ||
    Number(b.featured) - Number(a.featured) ||
    a.name.localeCompare(b.name, "es") ||
    a.id.localeCompare(b.id);
}

/** Available publications with a photo, featured first: what can be offered when nothing else matched. */
export function availableWithPhoto<T extends Product>(products: readonly T[], limit: number): T[] {
  return availableFirst(products).filter(product => publicationAvailable(product) && product.primaryImageUrl?.trim()).slice(0, limit);
}

/** Amount the card highlights (cash, otherwise list); null when the price is to be confirmed. */
export function catalogCardPrice(product: Pick<Product, "price" | "transferPrice">): number | null {
  return cardCashPrice(product) ?? (hasValidWebPrice(product.price) ? product.price : null);
}

export const CATALOG_ORDER_OPTIONS = [
  { value: "menor-precio", label: "Menor precio" },
  { value: "mayor-precio", label: "Mayor precio" },
] as const;
export type CatalogOrder = (typeof CATALOG_ORDER_OPTIONS)[number]["value"];

export function parseCatalogOrder(value: unknown): CatalogOrder | null {
  return CATALOG_ORDER_OPTIONS.find(option => option.value === value)?.value ?? null;
}

/**
 * Catalog grid order. Without an explicit order it is the recommended one. By price, available publications stay
 * first, prices to be confirmed go after priced ones, and ties keep the recommended order.
 */
export function orderCatalog<T extends Product>(products: readonly T[], order: CatalogOrder | null): T[] {
  if (!order) return availableFirst(products);
  const direction = order === "menor-precio" ? 1 : -1;
  return [...products].sort((a, b) => {
    const availability = Number(publicationAvailable(b)) - Number(publicationAvailable(a));
    if (availability) return availability;
    const left = catalogCardPrice(a), right = catalogCardPrice(b);
    if (left === null || right === null) return Number(left === null) - Number(right === null) || recommendedOrder(a, b);
    return (left - right) * direction || recommendedOrder(a, b);
  });
}
