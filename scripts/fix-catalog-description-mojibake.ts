import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  executeCatalogDescriptionRepair,
  parseCatalogMojibakeAudit,
} from "../lib/products/catalog-mojibake-repair.ts";

const allowedArguments = new Set(["--apply"]);
const unknownArgument = process.argv.slice(2).find((argument) => !allowedArguments.has(argument));

if (unknownArgument) {
  throw new Error(`Argumento desconocido: ${unknownArgument}. Solo se admite --apply.`);
}

const apply = process.argv.includes("--apply");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Se requieren NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el proceso server-side.",
  );
}

const reportPath = join(process.cwd(), "reports", "catalog-mojibake-audit.csv");
const entries = parseCatalogMojibakeAudit(await readFile(reportPath, "utf8"));
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(
  apply
    ? "Modo APPLY: se exigirá coincidencia exacta antes de cada escritura."
    : "Modo DRY-RUN: no se escribirá ningún dato. Use --apply para aplicar.",
);

const results = await executeCatalogDescriptionRepair(
  entries,
  {
    async loadProduct(productId) {
      const { data, error } = await supabase
        .from("products")
        .select("id, description")
        .eq("id", productId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    },
    async updateDescription(productId, expectedCurrentValue, proposedFixedValue) {
      const { data, error } = await supabase
        .from("products")
        .update({ description: proposedFixedValue })
        .eq("id", productId)
        .eq("description", expectedCurrentValue)
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  },
  { apply },
);

for (const result of results) {
  console.log(`\n[${result.action}] ${result.name} (${result.productId})`);
  console.log(`Mensaje: ${result.message}`);
  console.log(`Before: ${result.before ?? "<NULL>"}`);
  console.log(`After: ${result.after ?? "<NULL>"}`);
}

const counts = results.reduce<Record<string, number>>((summary, result) => {
  summary[result.action] = (summary[result.action] ?? 0) + 1;
  return summary;
}, {});

console.log("\nResumen:", counts);

if (results.some((result) => result.action.startsWith("ABORT_"))) {
  process.exitCode = 1;
}
