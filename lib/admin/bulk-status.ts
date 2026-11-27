import { PRODUCT_STATUSES, type ProductStatus } from "../products/admin-product-policy.ts";
import { productStatusLabel } from "../products/product-availability.ts";
import { isSupersededYaraRosa } from "../products/yara-rosa-consolidation.ts";

/** One bulk change touches at most this many products; a larger selection is refused, never cut. */
export const BULK_STATUS_LIMIT = 100;
export type BulkStatusRow = { id: string; name: string; sku?: string | null; slug: string; status: string; historical_identity: boolean | null };
export type BulkStatusPlan = { change: BulkStatusRow[]; skip: { row: BulkStatusRow; reason: string }[]; tooMany: boolean };

export function parseBulkTarget(value: unknown): ProductStatus | null {
  return typeof value === "string" && (PRODUCT_STATUSES as readonly string[]).includes(value) ? value as ProductStatus : null;
}

/** The same rules decide the preview and, re-read from the database, the write. */
export function planBulkStatus(rows: BulkStatusRow[], target: ProductStatus, presentationIds: ReadonlySet<string>): BulkStatusPlan {
  const plan: BulkStatusPlan = { change: [], skip: [], tooMany: false };
  for (const row of rows) {
    const reason = row.historical_identity !== false ? "Identidad histórica: no admite cambios"
      : isSupersededYaraRosa(row) ? "Se conserva sólo para trazabilidad"
      : presentationIds.has(row.id) ? "Combo de cargador: se administra en Cargadores"
      : row.status === target ? `Ya está en ${productStatusLabel(target)}`
      : null;
    if (reason) plan.skip.push({ row, reason });
    else plan.change.push(row);
  }
  plan.tooMany = plan.change.length > BULK_STATUS_LIMIT;
  return plan;
}

/** True only when both lists hold the same ids, once each. */
export function sameSelection(confirmed: readonly string[], planned: readonly string[]) {
  const set = new Set(confirmed);
  return set.size === confirmed.length && set.size === planned.length && planned.every(id => set.has(id));
}
