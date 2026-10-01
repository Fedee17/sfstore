import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type CsvRow = Record<string, string>;
const reports = join(process.cwd(), "reports");

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

function csv(value: unknown) {
  const output = value == null ? "" : String(value);
  return /[",\r\n]/.test(output) ? `"${output.replace(/"/g, '""')}"` : output;
}

function number(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const canonicalNames: Record<string, string> = {
  "afnan-9pm-original-black": "Afnan 9PM Original Black",
  "afnan-9pm-rebel-100ml-edp": "Afnan 9PM Rebel 100ml EDP",
  "decants-muestras": "Decants Muestras",
  "desodorante-asad": "Desodorante Asad",
  "dolce-gabbana-light-blue-60ml": "Dolce & Gabbana Light Blue 60ml",
  "elfbar-30k": "Elfbar 30K",
  "elfbar-bc-15k": "Elfbar BC 15K",
  "frasco-generico-30ml": "Frasco genérico 30ml",
  "ignite-v150": "Ignite V150",
  "ignite-v151": "Ignite V151",
  "imperial-algarrobo-acero-bombilla-pico-loro": "Imperial Algarrobo Acero + Bombilla Pico de Loro",
  "lattafa-fakhar-gold-edition-alternativo": "Lattafa Fakhar Gold Edition Alternativo",
  "pava-electrica": "Pava eléctrica",
  secaplato: "Secaplato",
};

const categoryProposals: Record<string, {
  id: string;
  name: string;
  confidence: "HIGH" | "MEDIUM" | "PENDING";
  reason: string;
}> = {
  "afnan-9pm-original-black": { id: "d008cc8e-261c-4af3-9859-3a67702ff210", name: "Perfumes", confidence: "HIGH", reason: "Identidad de perfume confirmada por nombre y grupo historico." },
  "afnan-9pm-rebel-100ml-edp": { id: "d008cc8e-261c-4af3-9859-3a67702ff210", name: "Perfumes", confidence: "HIGH", reason: "EDP de 100 ml; corresponde inequivocamente a Perfumes." },
  "decants-muestras": { id: "d008cc8e-261c-4af3-9859-3a67702ff210", name: "Perfumes", confidence: "MEDIUM", reason: "Los decants activos actuales se agrupan en Perfumes, aunque existen registros legacy inconsistentes." },
  "desodorante-asad": { id: "d008cc8e-261c-4af3-9859-3a67702ff210", name: "Perfumes", confidence: "MEDIUM", reason: "Producto de fragancia separado del perfume Asad; no existe una categoria mas especifica." },
  "dolce-gabbana-light-blue-60ml": { id: "d008cc8e-261c-4af3-9859-3a67702ff210", name: "Perfumes", confidence: "HIGH", reason: "Perfume de 60 ml confirmado por identidad historica." },
  "elfbar-30k": { id: "a786f793-e04a-42de-bf4e-dd83ac3e22f1", name: "Electrónica", confidence: "MEDIUM", reason: "Dispositivo electronico; el catalogo no tiene una categoria especifica de vapeo." },
  "elfbar-bc-15k": { id: "a786f793-e04a-42de-bf4e-dd83ac3e22f1", name: "Electrónica", confidence: "MEDIUM", reason: "Dispositivo electronico; el catalogo no tiene una categoria especifica de vapeo." },
  "frasco-generico-30ml": { id: "6c932233-8d56-4c99-a066-cb44a37cc0ea", name: "Accesorios", confidence: "HIGH", reason: "Envase generico, no perfume; corresponde a Accesorios." },
  "ignite-v150": { id: "a786f793-e04a-42de-bf4e-dd83ac3e22f1", name: "Electrónica", confidence: "MEDIUM", reason: "Dispositivo electronico; el catalogo no tiene una categoria especifica de vapeo." },
  "ignite-v151": { id: "a786f793-e04a-42de-bf4e-dd83ac3e22f1", name: "Electrónica", confidence: "MEDIUM", reason: "Dispositivo electronico; el catalogo no tiene una categoria especifica de vapeo." },
  "imperial-algarrobo-acero-bombilla-pico-loro": { id: "61a589e6-7a88-4236-8813-8e3cbfdc3182", name: "Mates", confidence: "HIGH", reason: "Identidad principal: mate imperial de algarrobo; la bombilla forma parte del combo." },
  "lattafa-fakhar-gold-edition-alternativo": { id: "d008cc8e-261c-4af3-9859-3a67702ff210", name: "Perfumes", confidence: "HIGH", reason: "Identidad de perfume confirmada por nombre." },
  "pava-electrica": { id: "a786f793-e04a-42de-bf4e-dd83ac3e22f1", name: "Electrónica", confidence: "HIGH", reason: "Electrodomestico electrico; corresponde a Electrónica." },
  secaplato: { id: "6c932233-8d56-4c99-a066-cb44a37cc0ea", name: "Accesorios", confidence: "HIGH", reason: "Accesorio doméstico; categoría existente semánticamente compatible." },
};

const mappings = parseCsv(await readFile(join(reports, "historical-product-mapping-human-review.csv"), "utf8"))
  .filter((row) => row.final_decision === "CREATE_HISTORICAL");
const dryRun = parseCsv(await readFile(join(reports, "historical-import-dry-run.csv"), "utf8"));
const groups = new Map<string, CsvRow[]>();
for (const mapping of mappings) {
  const key = mapping.historical_group_key;
  if (!canonicalNames[key]) throw new Error(`Grupo histórico sin nombre canónico: ${key || mapping.excel_name}.`);
  groups.set(key, [...(groups.get(key) ?? []), mapping]);
}
if (groups.size !== 14 || mappings.length !== 17) {
  throw new Error(`Se esperaban 14 identidades y 17 aliases; se encontraron ${groups.size} y ${mappings.length}.`);
}

const headers = [
  "historical_group_key", "canonical_historical_name", "aliases", "proposed_category_id", "proposed_category_name", "category_confidence", "category_reason", "source_occurrences", "first_date", "last_date",
  "historical_units", "historical_sales_total", "historical_purchases_total", "proposed_status", "proposed_stock",
  "proposed_price", "proposed_transfer_price", "proposed_cost", "notes",
];
const rows = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => {
  const aliases = group.map((row) => row.excel_name);
  const transactions = dryRun.filter((row) => aliases.includes(row.source_product_name));
  const dates = transactions.map((row) => row.date).filter(Boolean).sort();
  const category = categoryProposals[key];
  if (!category) throw new Error(`Grupo historico sin auditoria de categoria: ${key}.`);
  return {
    historical_group_key: key,
    canonical_historical_name: canonicalNames[key],
    aliases: aliases.join("|"),
    proposed_category_id: category.id,
    proposed_category_name: category.name,
    category_confidence: category.confidence,
    category_reason: category.reason,
    source_occurrences: transactions.length,
    first_date: dates[0] ?? "",
    last_date: dates.at(-1) ?? "",
    historical_units: transactions.reduce((sum, row) => sum + number(row.quantity), 0),
    historical_sales_total: transactions.filter((row) => row.record_type === "sale").reduce((sum, row) => sum + number(row.total), 0).toFixed(2),
    historical_purchases_total: transactions.filter((row) => row.record_type === "purchase").reduce((sum, row) => sum + number(row.total), 0).toFixed(2),
    proposed_status: "archived",
    proposed_stock: "0",
    proposed_price: "",
    proposed_transfer_price: "",
    proposed_cost: "",
    notes: "Identidad aprobada. Price, transferencia, costo y descripcion corta permanecen NULL; no es vendible ni afecta inventario.",
  };
});

const output = [headers, ...rows.map((row) => headers.map((header) => row[header as keyof typeof row]))]
  .map((values) => values.map(csv).join(",")).join("\r\n") + "\r\n";
await writeFile(join(reports, "historical-products-to-create.csv"), output, "utf8");
console.log(`Identidades históricas: ${rows.length}; aliases: ${mappings.length}.`);
