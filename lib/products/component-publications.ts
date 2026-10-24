import type { Product } from "../../types/product.ts";
import { componentPublicationName, componentPublicationSlug, type CableConnector } from "./component-combos.ts";
import { getWebTransferPrice } from "../web-transfer-pricing.ts";

export type PublicComponentOfferRow = {
  id: string; name: string; connector: string; head_slug: string; cable_slug: string;
  presentation_product: string; combo_list_price: number | string; combo_transfer_price: number | string; price_version: string;
  image_id?: string | null; image_url?: string | null; image_alt?: string | null;
};
/** Availability is a projection of physical stock; this creates no inventory identity. */
export function projectComponentPublications(physical: Product[], offers: PublicComponentOfferRow[]): Product[] {
  const bySlug = new Map(physical.map(p => [p.slug, p])), seen = new Set<string>();
  return offers.flatMap(row => {
    if (row.connector !== "cc" && row.connector !== "lightning") return [];
    const connector: CableConnector = row.connector, head = bySlug.get(row.head_slug), cable = bySlug.get(row.cable_slug);
    const price = Number(row.combo_list_price), target = Number(row.combo_transfer_price);
    const slug = componentPublicationSlug(row.presentation_product, connector);
    if (seen.has(slug)) throw new Error("DUPLICATE_COMPONENT_PUBLICATION");
    seen.add(slug);
    if (!head || !cable || head.id === cable.id || !row.price_version || !Number.isFinite(price) || price <= 0 || target !== getWebTransferPrice(price)) return [];
    if (![head.stock, cable.stock].every(n => Number.isSafeInteger(n) && n >= 0)) return [];
    const name = componentPublicationName(connector);
    // Never borrow a component/other connector photo. Ambiguous metadata fails closed.
    const candidate = row.image_id && row.image_url?.trim();
    const reused = candidate && offers.some(other => other !== row && other.presentation_product === row.presentation_product &&
      other.connector !== connector && (other.image_id === row.image_id || other.image_url?.trim() === candidate));
    const imageUrl = candidate && !reused && /^https:\/\//i.test(candidate) ? candidate : null;
    const imageAlt = imageUrl ? `${name}${row.image_alt?.trim() ? ` — ${row.image_alt.trim()}` : ""}` : null;
    return [{
      id: `combo:${row.presentation_product}:${connector}`, kind: "combo", slug, name,
      category: head.category, categoryId: head.categoryId, categoryName: head.categoryName,
      featured: false, stock: Math.min(head.stock, cable.stock), price, transferPrice: target,
      shortDescription: `Un cabezal y un cable ${connector === "cc" ? "USB-C a USB-C" : "USB-C a Lightning"}. Precio especial por conjunto.`,
      description: "Incluye un cabezal y el cable indicado. Comparte disponibilidad con los componentes individuales; no tiene stock independiente. El 25% por transferencia se aplica una sola vez.",
      imagePlaceholder: connector === "cc" ? "C/C" : "C/L", primaryImageUrl: imageUrl, primaryImageAlt: imageAlt,
      images: imageUrl ? [{url:imageUrl,alt:imageAlt,sort_order:0,is_primary:true}] : [],
      combo: { presentationId: row.presentation_product, connector, priceVersion: row.price_version, recipeName: row.name, head, cable },
    }];
  });
}
