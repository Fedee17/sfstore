import type { PublicProduct } from "../../services/products";
import { publicationAvailable } from "../products/public-families";

/** Curate the existing featured pool for the homepage only; never mutate catalog order or data. */
export function getHomeFeaturedProducts(products: PublicProduct[]) {
  const featured = products.filter(product => product.featured);
  const pool = featured.length ? featured : products;
  return [...pool].sort((a, b) =>
    Number(publicationAvailable(b)) - Number(publicationAvailable(a)) ||
    Number(Boolean(b.primaryImageUrl)) - Number(Boolean(a.primaryImageUrl)) ||
    a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id)
  ).slice(0, 6);
}
