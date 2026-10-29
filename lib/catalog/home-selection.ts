import type { PublicProduct } from "../../services/products";
import { publicationAvailable } from "../products/public-families";
import { getWebTransferPrice, hasValidWebPrice } from "../web-transfer-pricing";
import { isDecantProduct } from "./perfume-recommendation";

export type HomeFeaturedProduct = PublicProduct & { homePriceFrom?: boolean };

function isDecant(product: PublicProduct) {
  return isDecantProduct({ id: product.id, name: product.name, slug: product.slug, attributes: product.attributes });
}

function hasPhoto(product: PublicProduct) {
  return Boolean(product.primaryImageUrl?.trim());
}

/** Home-only projection: never mutate a publication, its SKU, price or catalog order. */
export function getHomeFeaturedProducts(products: PublicProduct[]): HomeFeaturedProduct[] {
  const eligible: HomeFeaturedProduct[] = [];
  for (const product of products) {
    if (!product.featured || isDecant(product)) continue;
    if (product.kind === "family") {
      const variants = (product.variants ?? []).filter(variant =>
        publicationAvailable(variant) && hasValidWebPrice(variant.price) && !isDecant(variant)
      );
      if (!variants.length) continue;
      const priceSource = variants.reduce((a, b) => a.price <= b.price ? a : b);
      const photoSource = hasPhoto(priceSource) ? priceSource : hasPhoto(product) ? product : variants.find(hasPhoto);
      if (!photoSource) continue;
      eligible.push({ ...product, price: priceSource.price, transferPrice: getWebTransferPrice(priceSource.price),
        primaryImageUrl: photoSource.primaryImageUrl, primaryImageAlt: photoSource.primaryImageAlt,
        homePriceFrom: variants.some(variant => variant.price !== priceSource.price) });
    } else if (publicationAvailable(product) && hasValidWebPrice(product.price) && hasPhoto(product)) {
      eligible.push(product);
    }
  }
  return eligible.sort((a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id)).slice(0, 6);
}
