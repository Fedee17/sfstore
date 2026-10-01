import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildHistoricalProductIdentity,
  historicalProductIdentityMatches,
} from "../lib/historical-import/historical-product.ts";

type CsvRow = Record<string, string>;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(value); value = ""; }
    else if (character === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += character;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
  return rows.filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const apply = process.argv.includes("--apply");
const rows = parseCsv(await readFile(join(process.cwd(), "reports", "historical-products-to-create.csv"), "utf8"));
const unresolved = rows.filter((row) => !row.proposed_category_id);
if (unresolved.length > 0) {
  throw new Error(`Hay ${unresolved.length} identidades sin categoria aprobada. No se puede continuar.`);
}

const supabase = createClient(
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

for (const row of rows) {
  const expected = buildHistoricalProductIdentity({
    historicalGroupKey: row.historical_group_key,
    name: row.canonical_historical_name,
    slug: `historical-${row.historical_group_key}`,
    categoryId: row.proposed_category_id,
  });
  const { data: existing, error: readError } = await supabase
    .from("products")
    .select("category_id,name,slug,short_description,description,price,transfer_price,compare_at_price,cost,cost_source_purchase_item_id,stock,sku,featured,status,historical_identity,historical_group_key")
    .or(`historical_group_key.eq.${expected.historical_group_key},slug.eq.${expected.slug}`);
  if (readError) throw new Error(readError.message);
  if ((existing ?? []).length > 1) throw new Error(`Conflicto multiple para ${expected.historical_group_key}.`);
  const current = existing?.[0];
  if (current) {
    if (!historicalProductIdentityMatches(current, expected)) {
      throw new Error(`La identidad existente no coincide: ${expected.historical_group_key}.`);
    }
    console.log(`SKIP ${expected.historical_group_key}: ya existe y coincide.`);
    continue;
  }
  if (!apply) {
    console.log(`DRY-RUN INSERT ${expected.historical_group_key}.`);
    continue;
  }
  const { error: insertError } = await supabase.from("products").insert(expected);
  if (insertError) throw new Error(insertError.message);
  console.log(`INSERT ${expected.historical_group_key}.`);
}

console.log(apply ? "Aplicacion finalizada." : "Dry-run finalizado. Use --apply para escribir.");
