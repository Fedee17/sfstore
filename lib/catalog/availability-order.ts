import type { Product } from "../../types/product.ts";
import { publicationAvailable } from "../products/public-families.ts";

/** Order complete, filtered publications without mutating their data or shared source order. */
export function availableFirst<T extends Product>(products: readonly T[]): T[] {
  return [...products].sort((a, b) =>
    Number(publicationAvailable(b)) - Number(publicationAvailable(a)) ||
    Number(b.featured) - Number(a.featured) ||
    a.name.localeCompare(b.name, "es") ||
    a.id.localeCompare(b.id),
  );
}

/** Available publications with a photo, featured first: what can be offered when nothing else matched. */
export function availableWithPhoto<T extends Product>(products: readonly T[], limit: number): T[] {
  return availableFirst(products).filter(product => publicationAvailable(product) && product.primaryImageUrl?.trim()).slice(0, limit);
}
