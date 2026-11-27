import type { AdminProduct } from "../../services/admin.ts";
import type { StockCoverage } from "./stock-health.ts";

export const LOW_STOCK_LIMIT = 3;

// The audited stock adjustment lives in the products list ("Detalle y ajustes"); other screens link there and land
// on the product's card. Family SKUs come without slug; their unique SKU finds the same card.
export function stockAdjustmentHref(product: { id: string; slug?: string; sku?: string | null }) {
  return `/admin/productos?search=${encodeURIComponent(product.slug ?? product.sku ?? "")}&status=all&view=details#producto-${product.id}`;
}
export function catalogIssues(product: AdminProduct): string[] {
  const issues: string[] = [];
  if (!product.product_images?.some(image => image.url?.trim())) issues.push("Sin foto");
  if (!Number.isFinite(product.price) || product.price <= 0) issues.push("Sin precio válido");
  if (!product.component_offer && (product.cost == null || !Number.isFinite(product.cost) || product.cost <= 0)) issues.push("Sin costo válido");
  return issues;
}

export const LISTING_MIN_DESCRIPTION = 80;
/** Public listing completeness, 25 points per check. Combos take their presentation from components: not scored. */
export function listingQuality(product: AdminProduct): { score: number; missing: string[] } | null {
  if (product.component_offer) return null;
  const images = (product.product_images ?? []).filter(image => image.url?.trim());
  const description = [product.description, product.short_description].some(text => (text?.trim().length ?? 0) >= LISTING_MIN_DESCRIPTION);
  const checks: [string, boolean][] = [
    ["Foto", images.length > 0],
    ["Texto alternativo", images.length > 0 && images.every(image => image.alt?.trim())],
    ["Descripción", description],
    ["Atributos", (product.product_attributes ?? []).some(attribute => attribute.value?.trim())],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  return { score: (checks.length - missing.length) * 25, missing };
}

export function availabilityRows(products: AdminProduct[], filter: string, coverage?: ReadonlyMap<string, StockCoverage> | null) {
  const rows = products.filter(product => product.status !== "archived");
  // "risk" fails closed: without sales coverage nothing is claimed to run out.
  if (filter === "risk") return rows.filter(product => coverage?.get(product.id)?.risk)
    .sort((a, b) => coverage!.get(a.id)!.coverageDays! - coverage!.get(b.id)!.coverageDays! || a.name.localeCompare(b.name, "es-AR"));
  return rows.filter(product => filter === "out" ? product.stock <= 0 : filter === "low" ? product.stock > 0 && product.stock <= LOW_STOCK_LIMIT : true)
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "es-AR"));
}
