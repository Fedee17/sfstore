import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  buildPerfumeBackfillDryRun,
  validatePerfumeBackfillDocument,
  type BackfillDatabaseProduct,
  type PerfumeBackfillDryRun,
} from "../lib/catalog/perfume-attribute-backfill.ts";
import {
  assertApprovedApplyPreflight,
  assertPostWriteVerification,
  buildBackfillInsertRows,
  canonicalizeBackfillPlan,
  executeAtomicAttributeInsert,
  parseBackfillMode,
  type BackfillApproval,
} from "../lib/catalog/perfume-attribute-backfill-apply.ts";

type DatabaseRow = {
  id: string;
  name: string;
  slug: string;
  categories:
    | BackfillDatabaseProduct["category"]
    | BackfillDatabaseProduct["category"][];
  product_attributes: BackfillDatabaseProduct["attributes"] | null;
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(
  projectRoot,
  "data",
  "perfume-attribute-backfill-final.json",
);
const approvalPath = resolve(
  projectRoot,
  "data",
  "perfume-attribute-backfill-approval.json",
);
const dryRunReportPath = resolve(
  projectRoot,
  "data",
  "perfume-attribute-backfill-dry-run.json",
);
const applyReportPath = resolve(
  projectRoot,
  "data",
  "perfume-attribute-backfill-apply-report.json",
);

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function firstCategory(categories: DatabaseRow["categories"]) {
  return Array.isArray(categories) ? categories[0] ?? null : categories;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createAdminClient() {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function readCurrentState(
  supabase: AdminClient,
  productIds: string[],
) {
  const [productsResult, perfumeCatalogResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        `
          id,
          name,
          slug,
          categories (id, name, slug),
          product_attributes (id, name, value)
        `,
      )
      .in("id", productIds),
    supabase
      .from("products")
      .select("id, categories!inner(slug)")
      .eq("categories.slug", "perfumes"),
  ]);

  if (productsResult.error) {
    throw new Error(`No se pudieron leer los productos: ${productsResult.error.message}`);
  }
  if (perfumeCatalogResult.error) {
    throw new Error(
      `No se pudo leer la categoría Perfumes: ${perfumeCatalogResult.error.message}`,
    );
  }

  return {
    databaseProducts: ((productsResult.data ?? []) as unknown as DatabaseRow[]).map(
      (row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        category: firstCategory(row.categories),
        attributes: row.product_attributes ?? [],
      }),
    ),
    perfumeCatalogIds: (
      (perfumeCatalogResult.data ?? []) as unknown as Array<{ id: string }>
    ).map((row) => row.id),
  };
}

function printSummary(report: PerfumeBackfillDryRun) {
  console.log(`Productos en archivo: ${report.summary.productsInFile}`);
  console.log(
    `Productos encontrados en Supabase: ${report.summary.productsFoundInSupabase}`,
  );
  console.log(`Productos válidos: ${report.summary.validProducts}`);
  console.log(`Productos inválidos: ${report.summary.invalidProducts}`);
  console.log("");
  console.log(`Atributos a crear: ${report.summary.attributesToCreate}`);
  console.log(`Atributos a reemplazar: ${report.summary.attributesToReplace}`);
  console.log(`Atributos sin cambios: ${report.summary.attributesUnchanged}`);
  console.log(`Filas a insertar: ${report.summary.rowsToInsert}`);
  console.log(`Filas administradas a eliminar: ${report.summary.managedRowsToDelete}`);
  console.log("");
  console.log(`Errores: ${report.summary.errors}`);
  console.log(`Warnings: ${report.summary.warnings}`);
}

async function writeDryRunReport(report: PerfumeBackfillDryRun) {
  const output = {
    schema_version: 1,
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    source_file: "data/perfume-attribute-backfill-final.json",
    ...report,
  };
  await writeFile(dryRunReportPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

async function main() {
  const mode = parseBackfillMode(process.argv.slice(2));
  const sourceText = await readFile(inputPath, "utf8");
  const source = JSON.parse(sourceText) as unknown;
  const validation = validatePerfumeBackfillDocument(source);
  const productIds = [
    ...new Set(validation.entries.map((entry) => entry.product_id).filter(Boolean)),
  ];
  const supabase = createAdminClient();
  const initialState = await readCurrentState(supabase, productIds);
  const initialReport = buildPerfumeBackfillDryRun(
    validation,
    initialState.databaseProducts,
    initialState.perfumeCatalogIds,
  );

  if (mode === "dry-run") {
    await writeDryRunReport(initialReport);
    printSummary(initialReport);
    console.log(`Reporte: ${dryRunReportPath}`);
    for (const issue of initialReport.errors) {
      console.error(`[${issue.code}] ${issue.product_id ?? "general"}: ${issue.message}`);
    }
    for (const issue of initialReport.warnings) {
      console.warn(`[${issue.code}] ${issue.product_id ?? "general"}: ${issue.message}`);
    }
    if (initialReport.summary.errors > 0) {
      process.exitCode = 1;
    }
    return;
  }

  const approval = JSON.parse(await readFile(approvalPath, "utf8")) as BackfillApproval;
  const sourceSha256 = sha256(sourceText);
  let insertedRows = 0;
  let postWriteReport: PerfumeBackfillDryRun | null = null;
  let finalResult: "success" | "failed" = "failed";
  let failure: string | null = null;
  let preflightState: "initial" | "already_applied" | null = null;

  try {
    preflightState = assertApprovedApplyPreflight(
      initialReport,
      approval,
      sourceSha256,
      sha256(canonicalizeBackfillPlan(initialReport)),
    );

    if (preflightState === "initial") {
      const immediateState = await readCurrentState(supabase, productIds);
      const immediateReport = buildPerfumeBackfillDryRun(
        validation,
        immediateState.databaseProducts,
        immediateState.perfumeCatalogIds,
      );
      const immediatePreflight = assertApprovedApplyPreflight(
        immediateReport,
        approval,
        sourceSha256,
        sha256(canonicalizeBackfillPlan(immediateReport)),
      );

      if (immediatePreflight === "initial") {
        const rows = buildBackfillInsertRows(immediateReport);
        if (rows.length !== approval.expected.rows_to_insert) {
          throw new Error(
            `El lote contiene ${rows.length} filas y se aprobaron ${approval.expected.rows_to_insert}.`,
          );
        }

        insertedRows = await executeAtomicAttributeInsert(rows, async (batch) => {
          const result = await supabase
            .from("product_attributes")
            .insert(batch)
            .select("id");
          return { data: result.data, error: result.error };
        });
      } else {
        preflightState = "already_applied";
      }
    }

    const postWriteState = await readCurrentState(supabase, productIds);
    postWriteReport = buildPerfumeBackfillDryRun(
      validation,
      postWriteState.databaseProducts,
      postWriteState.perfumeCatalogIds,
    );
    assertPostWriteVerification(postWriteReport, approval);
    finalResult = "success";
  } catch (error) {
    failure = error instanceof Error ? error.message : "Error desconocido durante apply.";
  }

  const applyReport = {
    schema_version: 1,
    mode: "apply",
    generated_at: new Date().toISOString(),
    source_file: "data/perfume-attribute-backfill-final.json",
    source_sha256: sourceSha256,
    approved_initial_plan_sha256: approval.initial_plan_sha256,
    preflight_plan_sha256: sha256(canonicalizeBackfillPlan(initialReport)),
    preflight_state: preflightState,
    preflight: initialReport.summary,
    rows_inserted: insertedRows,
    rows_deleted: 0,
    atomicity:
      "Una única inserción bulk en product_attributes; no se habilitaron deletes ni reemplazos.",
    post_write_verification: postWriteReport
      ? { success: finalResult === "success", summary: postWriteReport.summary }
      : { success: false, summary: null },
    warnings: postWriteReport?.warnings ?? initialReport.warnings,
    errors: failure ? [{ code: "apply_failed", message: failure }] : [],
    reconciliation: {
      required: finalResult !== "success",
      scope: productIds.map((product_id) => ({
        product_id,
        managed_attributes: [
          "commercial_category",
          "olfactory_family",
          "intensity",
          "occasion",
          "gender",
        ],
      })),
    },
    result: finalResult,
  };
  await writeFile(
    applyReportPath,
    `${JSON.stringify(applyReport, null, 2)}\n`,
    "utf8",
  );

  console.log(`Preflight: ${preflightState ?? "failed"}`);
  printSummary(initialReport);
  console.log(`Filas insertadas reales: ${insertedRows}`);
  console.log("Filas eliminadas reales: 0");
  console.log(`Verificación posterior: ${finalResult}`);
  console.log(`Reporte: ${applyReportPath}`);

  if (failure) {
    throw new Error(failure);
  }
}

await main();
