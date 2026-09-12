import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  buildPerfumeBackfillDryRun,
  validatePerfumeBackfillDocument,
  type BackfillDatabaseProduct,
} from "../lib/catalog/perfume-attribute-backfill.ts";

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
const reportPath = resolve(
  projectRoot,
  "data",
  "perfume-attribute-backfill-dry-run.json",
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

function assertDryRunOnly() {
  const unsupportedArguments = process.argv.slice(2).filter((arg) => arg !== "--dry-run");
  if (unsupportedArguments.length > 0) {
    throw new Error(
      `Esta fase sólo admite --dry-run. Argumentos no permitidos: ${unsupportedArguments.join(", ")}`,
    );
  }
}

async function main() {
  assertDryRunOnly();
  const source = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const validation = validatePerfumeBackfillDocument(source);
  const productIds = [
    ...new Set(validation.entries.map((entry) => entry.product_id).filter(Boolean)),
  ];
  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

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

  const databaseProducts = ((productsResult.data ?? []) as unknown as DatabaseRow[]).map(
    (row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: firstCategory(row.categories),
      attributes: row.product_attributes ?? [],
    }),
  );
  const perfumeCatalogIds = (perfumeCatalogResult.data ?? []).map((row) => row.id);
  const report = buildPerfumeBackfillDryRun(
    validation,
    databaseProducts,
    perfumeCatalogIds,
  );
  const output = {
    schema_version: 1,
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    source_file: "data/perfume-attribute-backfill-final.json",
    ...report,
  };

  await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

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
  console.log(`Filas a insertar (simuladas): ${report.summary.rowsToInsert}`);
  console.log(
    `Filas administradas a eliminar (simuladas): ${report.summary.managedRowsToDelete}`,
  );
  console.log("");
  console.log(`Errores: ${report.summary.errors}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  console.log(`Reporte: ${reportPath}`);

  for (const issue of report.errors) {
    console.error(`[${issue.code}] ${issue.product_id ?? "general"}: ${issue.message}`);
  }
  for (const issue of report.warnings) {
    console.warn(`[${issue.code}] ${issue.product_id ?? "general"}: ${issue.message}`);
  }

  if (report.summary.errors > 0) {
    process.exitCode = 1;
  }
}

await main();
