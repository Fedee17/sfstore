import type { AdminProduct } from "../../services/admin.ts";

export const LOW_STOCK_LIMIT = 3;
export function catalogIssues(product: AdminProduct): string[] {
  const issues: string[] = [];
  if (!product.product_images?.some(image => image.url?.trim())) issues.push("Sin foto");
  if (!Number.isFinite(product.price) || product.price <= 0) issues.push("Sin precio válido");
  if (!product.component_offer && (product.cost == null || !Number.isFinite(product.cost) || product.cost <= 0)) issues.push("Sin costo válido");
  return issues;
}

export function availabilityRows(products: AdminProduct[], filter: string) {
  const rows = products.filter(product => product.status !== "archived");
  return rows.filter(product => filter === "out" ? product.stock <= 0 : filter === "low" ? product.stock > 0 && product.stock <= LOW_STOCK_LIMIT : true)
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "es-AR"));
}
