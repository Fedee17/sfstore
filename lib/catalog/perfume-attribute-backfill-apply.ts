import type {
  BackfillFieldPlan,
  PerfumeBackfillDryRun,
  PerfumeCommercialKey,
} from "./perfume-attribute-backfill.ts";

export type BackfillMode = "dry-run" | "apply";

export type BackfillApproval = {
  schema_version: 1;
  source_sha256: string;
  initial_plan_sha256: string;
  expected: {
    products: number;
    valid_products: number;
    attributes_to_create: number;
    attributes_to_replace: number;
    attributes_unchanged: number;
    rows_to_insert: number;
    rows_to_delete: number;
    errors: number;
    warnings: number;
  };
};

export type BackfillInsertRow = {
  product_id: string;
  name: PerfumeCommercialKey;
  value: string;
  sort_order: number;
};

export type ApplyPreflightResult = "initial" | "already_applied";

export function parseBackfillMode(args: string[]): BackfillMode {
  const uniqueArguments = new Set(args);
  const unknown = [...uniqueArguments].filter(
    (argument) => argument !== "--dry-run" && argument !== "--apply",
  );
  if (unknown.length > 0) {
    throw new Error(`Argumentos no permitidos: ${unknown.join(", ")}.`);
  }
  if (uniqueArguments.has("--dry-run") && uniqueArguments.has("--apply")) {
    throw new Error("No se pueden combinar --dry-run y --apply.");
  }
  return uniqueArguments.has("--apply") ? "apply" : "dry-run";
}

export function canonicalizeBackfillPlan(report: PerfumeBackfillDryRun) {
  return JSON.stringify(
    report.products.map((product) => ({
      product_id: product.product_id,
      status: product.status,
      attributes: product.attributes.map((attribute) => ({
        field: attribute.field,
        actual: attribute.actual,
        desired: attribute.desired,
        action: attribute.action,
      })),
    })),
  );
}

function matchesInitialSummary(
  report: PerfumeBackfillDryRun,
  approval: BackfillApproval,
) {
  const { summary } = report;
  const expected = approval.expected;
  return (
    summary.productsInFile === expected.products &&
    summary.productsFoundInSupabase === expected.products &&
    summary.validProducts === expected.valid_products &&
    summary.invalidProducts === 0 &&
    summary.attributesToCreate === expected.attributes_to_create &&
    summary.attributesToReplace === expected.attributes_to_replace &&
    summary.attributesUnchanged === expected.attributes_unchanged &&
    summary.rowsToInsert === expected.rows_to_insert &&
    summary.managedRowsToDelete === expected.rows_to_delete &&
    summary.errors === expected.errors &&
    summary.warnings === expected.warnings
  );
}

function matchesAppliedSummary(
  report: PerfumeBackfillDryRun,
  approval: BackfillApproval,
) {
  const { summary } = report;
  return (
    summary.productsInFile === approval.expected.products &&
    summary.productsFoundInSupabase === approval.expected.products &&
    summary.validProducts === approval.expected.valid_products &&
    summary.invalidProducts === 0 &&
    summary.attributesToCreate === 0 &&
    summary.attributesToReplace === 0 &&
    summary.attributesUnchanged === approval.expected.attributes_to_create &&
    summary.rowsToInsert === 0 &&
    summary.managedRowsToDelete === 0 &&
    summary.errors === 0 &&
    summary.warnings === approval.expected.warnings
  );
}

export function assertApprovedApplyPreflight(
  report: PerfumeBackfillDryRun,
  approval: BackfillApproval,
  sourceSha256: string,
  planSha256: string,
): ApplyPreflightResult {
  if (sourceSha256 !== approval.source_sha256) {
    throw new Error("El hash del archivo fuente cambió respecto de la aprobación.");
  }
  if (matchesAppliedSummary(report, approval)) {
    return "already_applied";
  }
  if (!matchesInitialSummary(report, approval)) {
    throw new Error("El resumen del preflight no coincide con el dry-run aprobado.");
  }
  if (planSha256 !== approval.initial_plan_sha256) {
    throw new Error("El plan detallado cambió respecto del dry-run aprobado.");
  }
  return "initial";
}

export function buildBackfillInsertRows(
  report: PerfumeBackfillDryRun,
): BackfillInsertRow[] {
  const rows: BackfillInsertRow[] = [];

  for (const product of report.products) {
    if (product.status !== "valid") {
      continue;
    }
    for (const attribute of product.attributes) {
      if (attribute.action === "unchanged") {
        continue;
      }
      if (attribute.action !== "create") {
        throw new Error(
          `El modo apply inicial no admite reemplazar ${product.product_id}/${attribute.field}.`,
        );
      }
      rows.push(
        ...attribute.desired.map((value, sortOrder) => ({
          product_id: product.product_id,
          name: attribute.field,
          value,
          sort_order: sortOrder,
        })),
      );
    }
  }

  const uniqueRows = new Set(
    rows.map((row) => `${row.product_id}\u0000${row.name}\u0000${row.value}`),
  );
  if (uniqueRows.size !== rows.length) {
    throw new Error("El lote contiene filas de atributos duplicadas.");
  }
  return rows;
}

export function assertPostWriteVerification(
  report: PerfumeBackfillDryRun,
  approval: BackfillApproval,
) {
  if (!matchesAppliedSummary(report, approval)) {
    throw new Error("La verificación posterior no coincide con el estado esperado.");
  }
}

export function countCurrentManagedRows(plans: BackfillFieldPlan[]) {
  return plans.reduce((total, plan) => total + plan.actual.length, 0);
}

export async function executeAtomicAttributeInsert(
  rows: BackfillInsertRow[],
  writer: (
    batch: BackfillInsertRow[],
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>,
) {
  const result = await writer(rows);
  if (result.error) {
    throw new Error(`Falló la inserción atómica: ${result.error.message}`);
  }
  if (!result.data || result.data.length !== rows.length) {
    throw new Error(
      `Supabase confirmó ${result.data?.length ?? 0} de ${rows.length} filas esperadas.`,
    );
  }
  return result.data.length;
}
