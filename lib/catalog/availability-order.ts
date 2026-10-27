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
