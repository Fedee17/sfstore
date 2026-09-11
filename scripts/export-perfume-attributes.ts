import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  buildPerfumeAttributeExport,
  serializePerfumeAttributeCsv,
  serializePerfumeAttributeJson,
  type PerfumeExportSource,
} from "../lib/catalog/perfume-attribute-export.ts";

type ProductRow = {
  id: string;
  name: string | null;
  slug: string;
  sku: string | null;
  price: number | string | null;
  transfer_price: number | string | null;
  stock: number;
  categories: PerfumeExportSource["category"] | PerfumeExportSource["category"][];
  product_attributes: PerfumeExportSource["attributes"];
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = resolve(projectRoot, "data", "perfume-attribute-backfill.csv");
const jsonPath = resolve(projectRoot, "data", "perfume-attribute-backfill.json");

function getRequiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function firstCategory(categories: ProductRow["categories"]) {
  return Array.isArray(categories) ? categories[0] : categories;
}

async function main() {
  const supabase = createClient(
    getRequiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase
    .from("products")
    .select(
      `
        id,
        name,
        slug,
        sku,
        price,
        transfer_price,
        stock,
        categories!inner (id, name, slug),
        product_attributes (name, value)
      `,
    )
    .eq("categories.slug", "perfumes")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron leer los perfumes: ${error.message}`);
  }

  const products = ((data ?? []) as unknown as ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    price: row.price,
    transfer_price: row.transfer_price,
    stock: row.stock,
    category: firstCategory(row.categories),
    attributes: row.product_attributes,
  }));
  const result = buildPerfumeAttributeExport(products);

  await mkdir(dirname(csvPath), { recursive: true });
  await Promise.all([
    writeFile(csvPath, serializePerfumeAttributeCsv(result.records), "utf8"),
    writeFile(jsonPath, serializePerfumeAttributeJson(result.records), "utf8"),
  ]);

  console.log(`Perfumes encontrados: ${result.summary.total}`);
  console.log(`Con Marca: ${result.summary.withBrand}`);
  console.log(`Sin Marca: ${result.summary.withoutBrand}`);
  console.log(`Con Tipo: ${result.summary.withType}`);
  console.log(`Sin Tipo: ${result.summary.withoutType}`);
  console.log(
    `Con atributos comerciales: ${result.summary.withCommercialAttributes}`,
  );
  console.log(
    `Sin atributos comerciales: ${result.summary.withoutCommercialAttributes}`,
  );
  console.log(`Warnings: ${result.summary.warningCount}`);
  for (const warning of result.warnings) {
    console.warn(
      `[${warning.code}] ${warning.product_id} ${warning.name || "(sin nombre)"}: ${warning.detail}`,
    );
  }
  console.log(`CSV: ${csvPath}`);
  console.log(`JSON: ${jsonPath}`);
}

await main();
