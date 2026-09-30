import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PRODUCT_IMPORT_SLUG_ALIASES } from "../lib/product-import/aliases.ts";

type Confidence = "HIGH_CONFIDENCE" | "MEDIUM_CONFIDENCE" | "LOW_CONFIDENCE";
type FinalRecommendation = "MATCH_CANDIDATE_1" | "MATCH_CANDIDATE_2" | "CREATE_PRODUCT" | "NEEDS_HUMAN_CONTEXT";

type MappingRow = {
  excel_name: string;
  occurrences: string;
  first_date: string;
  last_date: string;
  top_candidate_1_name: string;
  top_candidate_1_id: string;
  top_candidate_1_reason: string;
  top_candidate_2_name: string;
  top_candidate_2_id: string;
  top_candidate_2_reason: string;
  exact_issue: "AMBIGUOUS" | "NOT_FOUND";
  recommended_decision: "MATCH" | "CREATE_LATER" | "REVIEW";
  final_product_id: string;
  final_decision: string;
  human_notes: string;
  historical_group_key: string;
  decision_reason: string;
};

type SaleReviewRow = {
  source_row: string;
  date: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  total: string;
  issue: string;
};

type PurchaseReviewRow = {
  source_row: string;
  date: string;
  product_name: string;
  quantity: string;
  unit_cost: string;
  total: string;
  issue: string;
};

type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  status: string;
  stock: number;
  sku: string | null;
  price: number;
  transfer_price: number | null;
  cost: number | null;
};

type CategoryRow = { id: string; name: string; slug: string };

type Metrics = {
  salesOccurrences: number;
  purchaseOccurrences: number;
  units: number;
  salesRevenue: number;
  purchaseTotal: number;
  impact: number;
  firstDate: string;
  lastDate: string;
  salePrices: number[];
  purchaseCosts: number[];
};

type Analysis = {
  mapping: MappingRow;
  metrics: Metrics;
  candidate1: ProductRow | null;
  candidate2: ProductRow | null;
  evidence: string;
  confidence: Confidence;
  recommendation: FinalRecommendation;
  probableCategory: string;
  doubt: string;
};

const root = process.cwd();
const reportsDirectory = join(root, "reports");
const mappingPath = join(reportsDirectory, "historical-product-mapping-human-review.csv");
const salesPath = join(reportsDirectory, "historical-sales-human-review.csv");
const purchasesPath = join(reportsDirectory, "historical-purchases-human-review.csv");
const outputPath = join(reportsDirectory, "historical-product-mapping-priority-review.md");

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

const supabase = createClient(
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function readAll<T>(table: string, select: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

async function readCsv<T>(filePath: string) {
  const content = await readFile(filePath, "utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))) as T[];
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value: unknown) {
  return normalize(value).replace(/\s+/g, "-");
}

function tokens(value: unknown) {
  const stop = new Set(["de", "del", "la", "el", "con", "y", "ml", "100ml", "1l"]);
  return normalize(value).split(" ").filter((token) => token.length > 1 && !stop.has(token));
}

function tokenEvidence(source: string, candidate: ProductRow) {
  const sourceTokens = new Set(tokens(source));
  const candidateTokens = new Set(tokens(candidate.name));
  const shared = [...sourceTokens].filter((token) => candidateTokens.has(token));
  const sourceOnly = [...sourceTokens].filter((token) => !candidateTokens.has(token));
  const candidateOnly = [...candidateTokens].filter((token) => !sourceTokens.has(token));
  return { shared, sourceOnly, candidateOnly };
}

function levenshtein(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

function similarity(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const aTokens = new Set(tokens(a));
  const bTokens = new Set(tokens(b));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return Math.max(edit, union ? shared / union : 0);
}

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value);
}

function numericRange(values: number[]) {
  if (!values.length) return "sin datos";
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[0] === sorted.at(-1) ? money(sorted[0]) : `${money(sorted[0])} a ${money(sorted.at(-1) ?? sorted[0])}`;
}

function md(value: unknown) {
  return text(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function isRestrictedHistoricalName(value: string) {
  return /\b(vape|vaper|elfbar|ignite|ignate)\b/i.test(normalize(value));
}

const [mappings, sales, purchases, products, categories] = await Promise.all([
  readCsv<MappingRow>(mappingPath),
  readCsv<SaleReviewRow>(salesPath),
  readCsv<PurchaseReviewRow>(purchasesPath),
  readAll<ProductRow>("products", "id,category_id,name,slug,status,stock,sku,price,transfer_price,cost"),
  readAll<CategoryRow>("categories", "id,name,slug"),
]);

const categoryById = new Map(categories.map((category) => [category.id, category]));
const productById = new Map(products.map((product) => [product.id, product]));
const canonicalRecommendations = new Map([
  ["Lattafa Yara Rosa", "05b34469-3eb8-4148-8e97-9a19f1c2df6e"],
  ["Lattafa Yara rosa", "05b34469-3eb8-4148-8e97-9a19f1c2df6e"],
  ["Lattafa Yara Tous", "e53066cc-9c35-47e2-8d27-0fe5fb425ce8"],
]);

function metricsFor(name: string): Metrics {
  const saleRows = sales.filter((row) => row.product_name === name);
  const purchaseRows = purchases.filter((row) => row.product_name === name);
  const dates = [...saleRows.map((row) => row.date), ...purchaseRows.map((row) => row.date)].filter(Boolean).sort();
  const salesRevenue = saleRows.reduce((sum, row) => sum + number(row.total), 0);
  const purchaseTotal = purchaseRows.reduce((sum, row) => sum + number(row.total), 0);
  return {
    salesOccurrences: saleRows.length,
    purchaseOccurrences: purchaseRows.length,
    units: [...saleRows, ...purchaseRows].reduce((sum, row) => sum + number(row.quantity), 0),
    salesRevenue,
    purchaseTotal,
    impact: salesRevenue + purchaseTotal,
    firstDate: dates[0] ?? "",
    lastDate: dates.at(-1) ?? "",
    salePrices: saleRows.map((row) => number(row.unit_price)).filter((value) => value > 0),
    purchaseCosts: purchaseRows.map((row) => number(row.unit_cost)).filter((value) => value >= 0),
  };
}

function candidateEvidence(source: string, candidate: ProductRow | null, metrics: Metrics) {
  if (!candidate) return "No hay candidato actual.";
  const tokenMatch = tokenEvidence(source, candidate);
  const alias = PRODUCT_IMPORT_SLUG_ALIASES[slugify(source) as keyof typeof PRODUCT_IMPORT_SLUG_ALIASES];
  const skuMatch = candidate.sku && normalize(source) === normalize(candidate.sku);
  const category = categoryById.get(candidate.category_id)?.name ?? "sin categoría";
  const pieces = [
    `tokens compartidos: ${tokenMatch.shared.join(", ") || "ninguno"}`,
    tokenMatch.sourceOnly.length ? `solo fuente: ${tokenMatch.sourceOnly.join(", ")}` : "",
    tokenMatch.candidateOnly.length ? `solo candidato: ${tokenMatch.candidateOnly.join(", ")}` : "",
    `similitud textual: ${similarity(source, candidate.name).toFixed(2)}`,
    skuMatch ? `SKU coincide: ${candidate.sku}` : candidate.sku ? `SKU actual: ${candidate.sku}` : "sin SKU",
    alias === candidate.slug ? `alias explícito -> ${candidate.slug}` : "",
    `categoría: ${category}`,
    `precio histórico vendido: ${numericRange(metrics.salePrices)}; actual price/transfer: ${money(Number(candidate.price))}/${candidate.transfer_price == null ? "sin transfer" : money(Number(candidate.transfer_price))}`,
    `costo histórico: ${numericRange(metrics.purchaseCosts)}; costo actual: ${candidate.cost == null ? "sin costo" : money(Number(candidate.cost))}`,
  ];
  return pieces.filter(Boolean).join("; ");
}

function confidenceFor(mapping: MappingRow, candidate1: ProductRow | null, candidate2: ProductRow | null): Confidence {
  if (!candidate1) return "LOW_CONFIDENCE";
  const explicitCanonical = canonicalRecommendations.get(mapping.excel_name) === candidate1.id;
  const normalizedEqual = normalize(mapping.excel_name) === normalize(candidate1.name);
  const alias = PRODUCT_IMPORT_SLUG_ALIASES[slugify(mapping.excel_name) as keyof typeof PRODUCT_IMPORT_SLUG_ALIASES] === candidate1.slug;
  const score = similarity(mapping.excel_name, candidate1.name);
  const competingEquivalent = candidate2
    ? normalize(candidate1.name) === normalize(candidate2.name) || Math.abs(score - similarity(mapping.excel_name, candidate2.name)) < 0.04
    : false;
  if (explicitCanonical && competingEquivalent) return "MEDIUM_CONFIDENCE";
  if (alias && !competingEquivalent) return "HIGH_CONFIDENCE";
  if ((normalizedEqual || score >= 0.9) && !competingEquivalent) return "HIGH_CONFIDENCE";
  if (score >= 0.68 || tokens(mapping.excel_name).filter((token) => tokens(candidate1.name).includes(token)).length >= 2) return "MEDIUM_CONFIDENCE";
  return "LOW_CONFIDENCE";
}

function probableCategory(mapping: MappingRow, candidate1: ProductRow | null) {
  if (isRestrictedHistoricalName(mapping.excel_name)) return "Producto restringido histórico; no inferir categoría actual";
  if (candidate1) return categoryById.get(candidate1.category_id)?.name ?? "Sin evidencia suficiente";
  const candidates = products
    .map((product) => ({ product, score: similarity(mapping.excel_name, product.name) }))
    .filter((entry) => entry.score >= 0.42)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  if (!candidates.length) return "Sin evidencia suficiente";
  const weights = new Map<string, number>();
  for (const entry of candidates) weights.set(entry.product.category_id, (weights.get(entry.product.category_id) ?? 0) + entry.score);
  const categoryId = [...weights.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return categoryById.get(categoryId)?.name ?? "Sin evidencia suficiente";
}

function doubtFor(mapping: MappingRow, candidate1: ProductRow | null, candidate2: ProductRow | null) {
  if (mapping.decision_reason) return mapping.decision_reason;
  if (mapping.exact_issue === "AMBIGUOUS") return "Dos productos actuales comparten el mismo nombre normalizado; la identidad histórica no decide qué registro es canónico.";
  if (isRestrictedHistoricalName(mapping.excel_name)) return "Producto restringido histórico sin equivalente vigente; recrearlo podría contradecir las reglas actuales del catálogo.";
  if (!candidate1) return "No existe candidato suficientemente similar ni SKU/alias que permita vincularlo.";
  const evidence = tokenEvidence(mapping.excel_name, candidate1);
  if (candidate2 && similarity(mapping.excel_name, candidate2.name) >= similarity(mapping.excel_name, candidate1.name) - 0.05) {
    return "Hay dos candidatos con evidencia textual comparable.";
  }
  if (evidence.shared.length <= 1) return "El nombre es genérico o comparte muy pocos tokens distintivos con el candidato.";
  if (evidence.sourceOnly.length) return `La fuente agrega o cambia variantes: ${evidence.sourceOnly.join(", ")}.`;
  return "El parecido es razonable, pero no existe alias explícito ni identificador histórico estable.";
}

function recommendationFor(mapping: MappingRow, candidate1: ProductRow | null, confidence: Confidence): FinalRecommendation {
  if (mapping.recommended_decision === "MATCH" && candidate1 && confidence !== "LOW_CONFIDENCE") return "MATCH_CANDIDATE_1";
  if (mapping.recommended_decision === "CREATE_LATER") {
    return isRestrictedHistoricalName(mapping.excel_name) ? "NEEDS_HUMAN_CONTEXT" : "CREATE_PRODUCT";
  }
  if (candidate1 && confidence === "HIGH_CONFIDENCE") return "MATCH_CANDIDATE_1";
  return "NEEDS_HUMAN_CONTEXT";
}

const analyses: Analysis[] = mappings.map((mapping) => {
  const metrics = metricsFor(mapping.excel_name);
  const proposedId = canonicalRecommendations.get(mapping.excel_name);
  let candidate1 = productById.get(proposedId ?? mapping.top_candidate_1_id) ?? null;
  let candidate2 = productById.get(mapping.top_candidate_2_id) ?? null;
  if (proposedId && candidate2?.id === proposedId) [candidate1, candidate2] = [candidate2, candidate1];
  const confidence = confidenceFor(mapping, candidate1, candidate2);
  return {
    mapping,
    metrics,
    candidate1,
    candidate2,
    evidence: candidateEvidence(mapping.excel_name, candidate1, metrics),
    confidence,
    recommendation: recommendationFor(mapping, candidate1, confidence),
    probableCategory: probableCategory(mapping, candidate1),
    doubt: doubtFor(mapping, candidate1, candidate2),
  };
});

const isResolvedDecision = (analysis: Analysis) =>
  ["MATCH", "CREATE_HISTORICAL", "CREATE_CURRENT_PRODUCT_REQUIRED", "OMIT", "SPLIT_BY_SOURCE_ROW"]
    .includes(analysis.mapping.final_decision.trim().toUpperCase());
const unresolvedAnalyses = analyses.filter((analysis) => !isResolvedDecision(analysis));
const unresolvedRanked = unresolvedAnalyses
  .sort((left, right) => right.metrics.impact - left.metrics.impact || right.metrics.salesOccurrences + right.metrics.purchaseOccurrences - left.metrics.salesOccurrences - left.metrics.purchaseOccurrences || left.mapping.excel_name.localeCompare(right.mapping.excel_name, "es"));
const top15 = unresolvedRanked.slice(0, 15);
const top10 = unresolvedRanked.slice(0, 10);
const createLater = unresolvedAnalyses.filter((analysis) => analysis.mapping.recommended_decision === "CREATE_LATER");
const review = unresolvedAnalyses.filter((analysis) => analysis.mapping.recommended_decision === "REVIEW");
const suggestedMatches = unresolvedAnalyses.filter((analysis) => analysis.mapping.recommended_decision === "MATCH");
const confidenceCounts = new Map<Confidence, number>();
for (const analysis of suggestedMatches) confidenceCounts.set(analysis.confidence, (confidenceCounts.get(analysis.confidence) ?? 0) + 1);

function candidateLines(candidate: ProductRow | null, reason: string) {
  if (!candidate) return ["- Ninguno."];
  const category = categoryById.get(candidate.category_id)?.name ?? "Sin categoría";
  return [
    `- Nombre: ${candidate.name}`,
    `- ID: \`${candidate.id}\``,
    `- Slug: \`${candidate.slug}\``,
    `- Status / stock: ${candidate.status} / ${candidate.stock}`,
    `- Categoría: ${category}`,
    `- SKU: ${candidate.sku ?? "sin SKU"}`,
    `- Price / transfer / cost: ${money(Number(candidate.price))} / ${candidate.transfer_price == null ? "sin transfer" : money(Number(candidate.transfer_price))} / ${candidate.cost == null ? "sin costo" : money(Number(candidate.cost))}`,
    `- Motivo: ${reason}`,
  ];
}

const lines: string[] = [];
lines.push("# Priorización de mappings históricos", "");
lines.push("> Análisis de solo lectura. Ningún `final_product_id` o `final_decision` fue modificado.", "");
lines.push("## Propuestas confirmables Yara", "");
lines.push("| Nombre histórico | recommended_decision | recommended_product_id | Estado humano |", "|---|---|---|---|");
for (const name of ["Lattafa Yara Rosa", "Lattafa Yara rosa", "Lattafa Yara Tous"]) {
  const analysis = analyses.find((entry) => entry.mapping.excel_name === name);
  if (analysis) lines.push(`| ${name} | MATCH | ${analysis.candidate1?.id ?? ""} | ${analysis.mapping.final_decision || "REVIEW"} |`);
}
lines.push("", "Los productos duplicados permanecen intactos; la columna Estado humano refleja la decisión vigente del CSV.", "");

lines.push("## TOP 15 mappings sin resolver por impacto", "");
for (const [index, analysis] of top15.entries()) {
  const { mapping, metrics, candidate1, candidate2 } = analysis;
  lines.push(`### ${index + 1}. ${mapping.excel_name}`, "");
  lines.push(`- Ocurrencias ventas / compras: ${metrics.salesOccurrences} / ${metrics.purchaseOccurrences}`);
  lines.push(`- Unidades: ${metrics.units}`);
  lines.push(`- Facturación histórica: ${money(metrics.salesRevenue)}`);
  lines.push(`- Compras históricas: ${money(metrics.purchaseTotal)}`);
  lines.push(`- Impacto total: ${money(metrics.impact)}`);
  lines.push(`- Primera / última aparición: ${metrics.firstDate || "sin fecha"} / ${metrics.lastDate || "sin fecha"}`, "");
  lines.push("#### Candidato 1", "", ...candidateLines(candidate1, mapping.top_candidate_1_reason || analysis.doubt), "");
  lines.push("#### Candidato 2", "", ...candidateLines(candidate2, mapping.top_candidate_2_reason), "");
  lines.push("#### Evidencia textual", "", analysis.evidence, "");
  lines.push("#### Recomendación", "");
  lines.push(`- ${analysis.recommendation}`);
  lines.push(`- Confianza: ${analysis.confidence}`);
  lines.push(`- Motivo de duda: ${analysis.doubt}`, "");
}

lines.push("## Casos CREATE_LATER", "");
lines.push("| Nombre histórico | Categoría probable | Ventas | Compras | Última fecha | Stock actual inferible | Candidato similar | Recomendación refinada |", "|---|---|---:|---:|---|---|---|---|");
for (const analysis of createLater.sort((left, right) => right.metrics.impact - left.metrics.impact)) {
  lines.push(`| ${md(analysis.mapping.excel_name)} | ${md(analysis.probableCategory)} | ${money(analysis.metrics.salesRevenue)} | ${money(analysis.metrics.purchaseTotal)} | ${analysis.metrics.lastDate || "sin fecha"} | NO INFERIR | ${md(analysis.candidate1?.name ?? "ninguno")} | ${analysis.recommendation} |`);
}
lines.push("");

lines.push("## Casos REVIEW", "");
lines.push("| Nombre histórico | Impacto | Candidato 1 | Duda exacta | Recomendación refinada |", "|---|---:|---|---|---|");
for (const analysis of review.sort((left, right) => right.metrics.impact - left.metrics.impact)) {
  lines.push(`| ${md(analysis.mapping.excel_name)} | ${money(analysis.metrics.impact)} | ${md(analysis.candidate1?.name ?? "ninguno")} | ${md(analysis.doubt)} | ${analysis.recommendation} |`);
}
lines.push("");

lines.push("## Casos MATCH sugeridos", "");
lines.push("| Nombre histórico | Candidato | Categoría | Precios históricos | Costo histórico | Confianza | Evidencia |", "|---|---|---|---|---|---|---|");
for (const analysis of suggestedMatches.sort((left, right) => right.metrics.impact - left.metrics.impact)) {
  lines.push(`| ${md(analysis.mapping.excel_name)} | ${md(analysis.candidate1?.name ?? "ninguno")} (${analysis.candidate1?.id ?? "-"}) | ${md(analysis.probableCategory)} | ${numericRange(analysis.metrics.salePrices)} | ${numericRange(analysis.metrics.purchaseCosts)} | ${analysis.confidence} | ${md(analysis.evidence)} |`);
}
lines.push("");
lines.push(`Confianza entre los 10 MATCH sugeridos: HIGH ${confidenceCounts.get("HIGH_CONFIDENCE") ?? 0}, MEDIUM ${confidenceCounts.get("MEDIUM_CONFIDENCE") ?? 0}, LOW ${confidenceCounts.get("LOW_CONFIDENCE") ?? 0}.`, "");

lines.push("## Alcance y seguridad", "");
lines.push("- Los mappings sin decisión final están ordenados por ventas + compras, sin duplicar filas.");
lines.push("- Precio/costo se usa únicamente como señal secundaria.");
lines.push("- Categoría probable se deriva de candidatos actuales; si no hay evidencia, se informa como tal.");
lines.push("- No se infiere stock histórico o actual.");
lines.push("- Operaciones contra Supabase: solo SELECT.");

await writeFile(outputPath, lines.join("\n") + "\n", "utf8");

console.log(`Archivo: ${outputPath}`);
console.log(`TOP 10 impacto total: ${money(top10.reduce((sum, analysis) => sum + analysis.metrics.impact, 0))}`);
console.log(`MATCH confidence: HIGH ${confidenceCounts.get("HIGH_CONFIDENCE") ?? 0}, MEDIUM ${confidenceCounts.get("MEDIUM_CONFIDENCE") ?? 0}, LOW ${confidenceCounts.get("LOW_CONFIDENCE") ?? 0}`);
for (const [index, analysis] of top10.entries()) {
  console.log(JSON.stringify({
    rank: index + 1,
    name: analysis.mapping.excel_name,
    impact: analysis.metrics.impact,
    occurrences: analysis.metrics.salesOccurrences + analysis.metrics.purchaseOccurrences,
    candidate: analysis.candidate1?.name ?? "ninguno",
    productId: analysis.candidate1?.id ?? "",
    confidence: analysis.confidence,
    reason: analysis.doubt,
    alternative: analysis.candidate2?.name ?? "ninguna",
    recommendation: analysis.recommendation,
  }));
}
