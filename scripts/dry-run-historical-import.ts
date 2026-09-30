import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import { PRODUCT_IMPORT_SLUG_ALIASES } from "../lib/product-import/aliases.ts";

type Decision = "INSERT" | "OMIT" | "REVIEW" | "INVALID";
type ReadinessStatus =
  | "READY"
  | "HISTORICAL_PRODUCT_READY"
  | "CURRENT_PRODUCT_REQUIRED"
  | "SOURCE_DATE_REQUIRED"
  | "POSSIBLE_DUPLICATE"
  | "TOTAL_REVIEW"
  | "INVALID"
  | "REVIEW_REQUIRED";
type MatchType = "EXACT_MATCH" | "NORMALIZED_MATCH" | "ALIAS_MATCH" | "AMBIGUOUS" | "NOT_FOUND" | "MANUAL_MATCH";

type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  sku: string | null;
  status: string;
  stock: number;
  price: number;
  transfer_price: number | null;
  cost: number | null;
  created_at: string;
};
type CategoryRow = { id: string; name: string; slug: string };
type AttributeRow = { product_id: string; name: string; value: string; sort_order: number };
type ImageRow = { product_id: string; url: string; is_primary: boolean; sort_order: number; created_at: string };
type SupplierRow = { id: string; name: string; normalized_name: string };
type PurchaseRow = { id: string; purchase_date: string; status: string; supplier_id: string; total_cost: number; confirmed_at: string | null; created_at: string };
type PurchaseItemRow = { id: string; purchase_id: string; product_id: string; quantity: number; unit_purchase_cost: number; supplier_line_total: number };
type OrderRow = { id: string; order_number: string; channel: string; status: string; payment_status: string; total: number; created_at: string };
type OrderItemRow = { id: string; order_id: string; product_id: string | null; product_name: string; quantity: number; unit_price: number; subtotal: number };
type OrderPaymentRow = { id: string; order_id: string; method: string; amount: number; status: string; reference: string | null; created_at: string };

type Match = {
  type: MatchType;
  candidates: ProductRow[];
  reason: string;
};

type SaleSource = {
  sourceRow: number;
  date: string | null;
  productName: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
  paymentMethod: string;
  margin: number | null;
  debt: string;
  match: Match;
  duplicateRows: number[];
  databaseCandidates: string[];
};

type PurchaseSource = {
  sourceRow: number;
  date: string | null;
  productName: string;
  quantity: number | null;
  unitCost: number | null;
  total: number | null;
  totalUsd: number | null;
  shipping: number | null;
  match: Match;
  duplicateRows: number[];
  databaseCandidates: string[];
};

type PreservedMapping = {
  final_product_id?: string;
  final_decision?: string;
  notes?: string;
  historical_group_key?: string;
  decision_reason?: string;
};

type DryRunRow = {
  source_sheet: string;
  source_row: number;
  split_line: number | "";
  record_type: "sale" | "purchase";
  source_product_name: string;
  matched_product_id: string;
  matched_product_name: string;
  date: string;
  source_quantity: number | null;
  source_total: number | null;
  quantity: number | null;
  unit_amount: number | null;
  total: number | null;
  decision: Decision;
  readiness_status: ReadinessStatus;
  reason: string;
  fingerprint: string;
};

const root = process.cwd();
const inputPath = join(root, "data", "SFSTORE_control_emprendimiento_.xlsx");
const reportsDirectory = join(root, "reports");
const mappingReviewPath = join(reportsDirectory, "historical-product-mapping-review.csv");
const salesReviewPath = join(reportsDirectory, "historical-sales-review.csv");
const purchasesReviewPath = join(reportsDirectory, "historical-purchases-review.csv");
const dryRunCsvPath = join(reportsDirectory, "historical-import-dry-run.csv");
const dryRunMarkdownPath = join(reportsDirectory, "historical-import-dry-run.md");
const humanMappingReviewPath = join(reportsDirectory, "historical-product-mapping-human-review.csv");
const humanSalesReviewPath = join(reportsDirectory, "historical-sales-human-review.csv");
const humanPurchasesReviewPath = join(reportsDirectory, "historical-purchases-human-review.csv");
const humanSummaryPath = join(reportsDirectory, "historical-human-review-summary.md");
const inventoryAdjustmentsPath = join(reportsDirectory, "historical-current-inventory-adjustments-review.csv");
const sourceFile = basename(inputPath);

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

async function readAll<T>(table: string, select: string, orderColumn = "id") {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

async function hashFile(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/\s/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(",") && raw.includes(".")) {
    normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    normalized = raw.replace(",", ".");
  }
  const parsed = Number(normalized.replace(/[^0-9+\-.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
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

function roundMoney(value: number | null) {
  return value == null ? null : Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number | null) {
  return value == null ? "" : roundMoney(value)?.toFixed(2) ?? "";
}

function excelDate(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed?.y || !parsed.m || !parsed.d) return null;
  return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function fingerprint(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function escapeCsv(value: unknown) {
  const output = value == null ? "" : String(value);
  return /[",\r\n]/.test(output) ? `"${output.replace(/"/g, '""')}"` : output;
}

function serializeCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  return [headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n") + "\r\n";
}

function parseCsv(content: string) {
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
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function escapeMarkdown(value: unknown) {
  return text(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function readinessStatus(decision: Decision, reason: string): ReadinessStatus {
  if (decision === "INVALID") return "INVALID";
  if (reason.includes("CURRENT_PRODUCT_REQUIRED")) return "CURRENT_PRODUCT_REQUIRED";
  if (reason.includes("HISTORICAL_PRODUCT_REQUIRED")) return "HISTORICAL_PRODUCT_READY";
  if (reason.includes("FECHA_AUSENTE") || reason.includes("FECHA_INVALIDA")) return "SOURCE_DATE_REQUIRED";
  if (reason.includes("DUPLICADO_POTENCIAL") || reason.includes("POSIBLE_OPERACION_EXISTENTE")) return "POSSIBLE_DUPLICATE";
  if (reason.includes("TOTAL_INCONSISTENTE")) return "TOTAL_REVIEW";
  if (decision === "INSERT") return "READY";
  return "REVIEW_REQUIRED";
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
  const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const leftTokens = new Set(a.split(" "));
  const rightTokens = new Set(b.split(" "));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return Math.max(editScore, union ? shared / union : 0);
}

function findSuggestions(name: string, products: ProductRow[]) {
  return products
    .map((product) => ({
      product,
      score: Math.max(similarity(name, product.name), product.sku ? similarity(name, product.sku) : 0),
    }))
    .filter((entry) => entry.score >= 0.48)
    .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, "es"))
    .slice(0, 4);
}

function matchProduct(name: string, products: ProductRow[]): Match {
  const exact = products.filter((product) => text(product.name) === text(name));
  if (exact.length === 1) return { type: "EXACT_MATCH", candidates: exact, reason: "Nombre idéntico." };
  if (exact.length > 1) return { type: "AMBIGUOUS", candidates: exact, reason: "Más de un producto tiene el mismo nombre." };

  const normalized = products.filter((product) => normalize(product.name) === normalize(name));
  if (normalized.length === 1) return { type: "NORMALIZED_MATCH", candidates: normalized, reason: "Coincidencia única ignorando mayúsculas, tildes y espacios." };
  if (normalized.length > 1) return { type: "AMBIGUOUS", candidates: normalized, reason: "La normalización coincide con varios productos." };

  const canonicalSlug = PRODUCT_IMPORT_SLUG_ALIASES[slugify(name) as keyof typeof PRODUCT_IMPORT_SLUG_ALIASES];
  if (canonicalSlug) {
    const aliased = products.filter((product) => product.slug === canonicalSlug);
    if (aliased.length === 1) return { type: "ALIAS_MATCH", candidates: aliased, reason: `Alias explícito ${slugify(name)} -> ${canonicalSlug}.` };
    if (aliased.length > 1) return { type: "AMBIGUOUS", candidates: aliased, reason: "El alias explícito apunta a varios productos." };
  }
  return { type: "NOT_FOUND", candidates: [], reason: "Sin coincidencia exacta, normalizada, por SKU o alias aprobado." };
}

function duplicateGroups<T extends { sourceRow: number }>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function mapPaymentMethod(value: string) {
  const normalized = normalize(value);
  if (normalized === "efectivo") return "cash";
  if (normalized === "transferencia") return "transfer";
  if (normalized === "credito" || normalized === "debito") return "card";
  return null;
}

async function readPreservedMappings(): Promise<Map<string, PreservedMapping>> {
  try {
    const content = await readFile(mappingReviewPath);
    const workbook = XLSX.read(content, { type: "buffer", raw: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
    return new Map(rows.map((row) => [text(row.excel_name), {
      final_product_id: text(row.final_product_id),
      final_decision: text(row.final_decision),
      notes: text(row.notes),
      historical_group_key: text(row.historical_group_key),
      decision_reason: text(row.decision_reason),
    }]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
}

async function readCsvRows(filePath: string) {
  try {
    return parseCsv(await readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

const inputStats = await stat(inputPath);
const inputHash = await hashFile(inputPath);
const workbook = XLSX.readFile(inputPath, { cellDates: false, cellText: true, cellNF: true });
const salesMatrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Control de ventas"], { header: 1, raw: true, defval: null });
const purchasesMatrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Control de compras"], { header: 1, raw: true, defval: null });

const [products, categories, attributes, images, suppliers, purchases, purchaseItems, orders, orderItems, orderPayments] = await Promise.all([
  readAll<ProductRow>("products", "id,category_id,name,slug,sku,status,stock,price,transfer_price,cost,created_at"),
  readAll<CategoryRow>("categories", "id,name,slug"),
  readAll<AttributeRow>("product_attributes", "product_id,name,value,sort_order"),
  readAll<ImageRow>("product_images", "product_id,url,is_primary,sort_order,created_at"),
  readAll<SupplierRow>("suppliers", "id,name,normalized_name"),
  readAll<PurchaseRow>("purchases", "id,purchase_date,status,supplier_id,total_cost,confirmed_at,created_at"),
  readAll<PurchaseItemRow>("purchase_items", "id,purchase_id,product_id,quantity,unit_purchase_cost,supplier_line_total"),
  readAll<OrderRow>("orders", "id,order_number,channel,status,payment_status,total,created_at"),
  readAll<OrderItemRow>("order_items", "id,order_id,product_id,product_name,quantity,unit_price,subtotal"),
  readAll<OrderPaymentRow>("order_payments", "id,order_id,method,amount,status,reference,created_at"),
]);

const salesBase = salesMatrix.slice(1).map((row, index) => ({
  sourceRow: index + 2,
  date: excelDate(row[0]),
  productName: text(row[1]),
  quantity: numeric(row[2]),
  unitPrice: numeric(row[3]),
  total: numeric(row[4]),
  paymentMethod: text(row[5]),
  margin: numeric(row[6]),
  debt: text(row[7]),
})).filter((row) => row.productName || row.date);

const purchasesBase = purchasesMatrix.slice(1).map((row, index) => ({
  sourceRow: index + 2,
  date: excelDate(row[1]),
  productName: text(row[2]),
  quantity: numeric(row[3]),
  unitCost: numeric(row[4]),
  total: numeric(row[5]),
  totalUsd: numeric(row[6]),
  shipping: numeric(row[7]),
})).filter((row) => row.productName || row.date);

const salesDuplicateGroups = duplicateGroups(salesBase, (row) => JSON.stringify([
  row.date, normalize(row.productName), row.quantity, roundMoney(row.unitPrice), roundMoney(row.total), normalize(row.paymentMethod), row.debt,
]));
const purchaseDuplicateGroups = duplicateGroups(purchasesBase, (row) => JSON.stringify([
  row.date, normalize(row.productName), row.quantity, roundMoney(row.unitCost), roundMoney(row.total), roundMoney(row.shipping),
]));

const saleDuplicateRows = new Map<number, number[]>();
for (const group of salesDuplicateGroups) {
  for (const row of group) saleDuplicateRows.set(row.sourceRow, group.map((item) => item.sourceRow));
}
const purchaseDuplicateRows = new Map<number, number[]>();
for (const group of purchaseDuplicateGroups) {
  for (const row of group) purchaseDuplicateRows.set(row.sourceRow, group.map((item) => item.sourceRow));
}

const orderById = new Map(orders.map((order) => [order.id, order]));
const purchaseById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
const productMatchCache = new Map<string, Match>();
const getMatch = (name: string) => {
  const existing = productMatchCache.get(name);
  if (existing) return existing;
  const match = matchProduct(name, products);
  productMatchCache.set(name, match);
  return match;
};

const sales: SaleSource[] = salesBase.map((row) => {
  const match = getMatch(row.productName);
  const productId = match.candidates.length === 1 ? match.candidates[0].id : null;
  const databaseCandidates = productId && row.date
    ? orderItems.filter((item) => {
        const order = orderById.get(item.order_id);
        return order?.created_at.slice(0, 10) === row.date
          && item.product_id === productId
          && roundMoney(Number(item.quantity)) === roundMoney(row.quantity)
          && roundMoney(Number(item.unit_price)) === roundMoney(row.unitPrice)
          && roundMoney(Number(item.subtotal)) === roundMoney(row.total);
      }).map((item) => item.order_id)
    : [];
  return { ...row, match, duplicateRows: saleDuplicateRows.get(row.sourceRow) ?? [], databaseCandidates };
});

const historicalPurchases: PurchaseSource[] = purchasesBase.map((row) => {
  const match = getMatch(row.productName);
  const productId = match.candidates.length === 1 ? match.candidates[0].id : null;
  const databaseCandidates = productId && row.date
    ? purchaseItems.filter((item) => {
        const purchase = purchaseById.get(item.purchase_id);
        return purchase?.purchase_date === row.date
          && item.product_id === productId
          && roundMoney(Number(item.quantity)) === roundMoney(row.quantity)
          && roundMoney(Number(item.unit_purchase_cost)) === roundMoney(row.unitCost)
          && roundMoney(Number(item.supplier_line_total)) === roundMoney(row.total);
      }).map((item) => item.purchase_id)
    : [];
  return { ...row, match, duplicateRows: purchaseDuplicateRows.get(row.sourceRow) ?? [], databaseCandidates };
});

const preservedMappings = await readPreservedMappings();
const unresolvedNames = [...new Set(
  [...sales, ...historicalPurchases]
    .filter((row) => row.match.type === "AMBIGUOUS" || row.match.type === "NOT_FOUND")
    .map((row) => row.productName),
)].sort((left, right) => left.localeCompare(right, "es"));

const mappingReviewRows = unresolvedNames.map((name) => {
  const occurrences = [...sales, ...historicalPurchases].filter((row) => row.productName === name);
  const match = getMatch(name);
  const suggestions = match.type === "AMBIGUOUS"
    ? match.candidates.map((product) => ({ product, score: 1 }))
    : findSuggestions(name, products);
  const dates = occurrences.map((row) => row.date).filter((date): date is string => Boolean(date)).sort();
  const preserved = preservedMappings.get(name) ?? {};
  return {
    excel_name: name,
    source_sheet: [...new Set(occurrences.map((row) => "unitPrice" in row ? "Control de ventas" : "Control de compras"))].join("|"),
    occurrences: occurrences.length,
    first_date: dates[0] ?? "",
    last_date: dates.at(-1) ?? "",
    suggested_product_id: suggestions.map((entry) => entry.product.id).join("|"),
    suggested_product_name: suggestions.map((entry) => entry.product.name).join("|"),
    suggestion_type: match.type === "AMBIGUOUS" ? "AMBIGUOUS_CANDIDATES" : suggestions.length ? "FUZZY_REVIEW_ONLY" : "NO_SUGGESTION",
    confidence_reason: match.type === "AMBIGUOUS"
      ? match.reason
      : suggestions.length
        ? suggestions.map((entry) => `similitud ${entry.score.toFixed(2)} con ${entry.product.slug}`).join("; ")
        : "No hay candidato con similitud mínima; el Excel no incluye SKU.",
    requires_human_review: "TRUE",
    final_product_id: preserved.final_product_id ?? "",
    final_decision: preserved.final_decision ?? "REVIEW",
    notes: preserved.notes ?? "",
    historical_group_key: preserved.historical_group_key ?? "",
    decision_reason: preserved.decision_reason ?? "",
  };
});

const manualMappingByName = new Map(mappingReviewRows.map((row) => [row.excel_name, row]));

function resolveFinalProduct(name: string, match: Match) {
  if (match.candidates.length === 1 && !["AMBIGUOUS", "NOT_FOUND"].includes(match.type)) {
    return { product: match.candidates[0], matchType: match.type, finalDecision: "AUTO" };
  }
  const review = manualMappingByName.get(name);
  const finalDecision = text(review?.final_decision).toUpperCase();
  if (finalDecision === "OMIT") return { product: null, matchType: match.type, finalDecision: "OMIT" };
  if (finalDecision === "CREATE_HISTORICAL") {
    return { product: null, matchType: match.type, finalDecision: "CREATE_HISTORICAL" };
  }
  if (finalDecision === "CREATE_CURRENT_PRODUCT_REQUIRED") {
    return { product: null, matchType: match.type, finalDecision: "CREATE_CURRENT_PRODUCT_REQUIRED" };
  }
  if (["MATCH", "MAP", "APPROVED", "INSERT"].includes(finalDecision) && review?.final_product_id) {
    const product = products.find((candidate) => candidate.id === review.final_product_id);
    if (product) return { product, matchType: "MANUAL_MATCH" as const, finalDecision };
  }
  return { product: null, matchType: match.type, finalDecision: "REVIEW" };
}

function saleIssues(row: SaleSource) {
  const issues: string[] = [];
  if (!row.date) issues.push("FECHA_INVALIDA");
  if (!row.productName) issues.push("PRODUCTO_VACIO");
  if (row.quantity == null || row.quantity <= 0 || !Number.isInteger(row.quantity)) issues.push("CANTIDAD_INVALIDA");
  if (row.unitPrice == null || row.unitPrice <= 0) issues.push("PRECIO_INVALIDO");
  if (row.total == null || row.total <= 0) issues.push("TOTAL_INVALIDO");
  if (row.quantity != null && row.unitPrice != null && row.total != null && Math.abs((roundMoney(row.quantity * row.unitPrice) ?? 0) - (roundMoney(row.total) ?? 0)) > 0.01) issues.push("TOTAL_INCONSISTENTE");
  if (row.duplicateRows.length) issues.push(`DUPLICADO_POTENCIAL_FILAS_${row.duplicateRows.join("_")}`);
  if (row.match.type === "AMBIGUOUS") issues.push("PRODUCTO_AMBIGUO");
  if (row.match.type === "NOT_FOUND") issues.push("PRODUCTO_NO_ENCONTRADO");
  if (row.databaseCandidates.length) issues.push(`POSIBLE_OPERACION_EXISTENTE_${row.databaseCandidates.join("_")}`);
  if (!mapPaymentMethod(row.paymentMethod)) issues.push("MEDIO_PAGO_NO_MAPEABLE");
  if (row.debt) issues.push("DEUDA_O_PAGO_INCOMPLETO");
  return issues;
}

function purchaseIssues(row: PurchaseSource) {
  const issues: string[] = [];
  if (!row.date) issues.push("FECHA_AUSENTE");
  if (!row.productName) issues.push("PRODUCTO_VACIO");
  if (row.quantity == null || row.quantity <= 0 || !Number.isInteger(row.quantity)) issues.push("CANTIDAD_INVALIDA");
  if (row.unitCost == null || row.unitCost < 0) issues.push("COSTO_INVALIDO");
  if (row.total == null || row.total < 0) issues.push("TOTAL_INVALIDO");
  if (row.quantity != null && row.unitCost != null && row.total != null && Math.abs((roundMoney(row.quantity * row.unitCost) ?? 0) - (roundMoney(row.total) ?? 0)) > 0.01) issues.push("TOTAL_INCONSISTENTE");
  if (row.duplicateRows.length) issues.push(`DUPLICADO_POTENCIAL_FILAS_${row.duplicateRows.join("_")}`);
  if (row.match.type === "AMBIGUOUS") issues.push("PRODUCTO_AMBIGUO");
  if (row.match.type === "NOT_FOUND") issues.push("PRODUCTO_NO_ENCONTRADO");
  if (row.databaseCandidates.length) issues.push(`POSIBLE_OPERACION_EXISTENTE_${row.databaseCandidates.join("_")}`);
  return issues;
}

function classifySale(row: SaleSource): DryRunRow {
  const issues = saleIssues(row);
  const resolved = resolveFinalProduct(row.productName, row.match);
  const explicitReviewReason = text(manualMappingByName.get(row.productName)?.decision_reason);
  const effectiveIssues = resolved.product
    ? issues.filter((issue) => !["PRODUCTO_AMBIGUO", "PRODUCTO_NO_ENCONTRADO"].includes(issue))
    : issues;
  let decision: Decision = "INSERT";
  let reason = "Fila válida, producto resuelto y pago documentado; candidata a venta histórica sin efecto de inventario.";
  const invalid = issues.some((issue) => ["FECHA_INVALIDA", "PRODUCTO_VACIO", "CANTIDAD_INVALIDA", "PRECIO_INVALIDO", "TOTAL_INVALIDO"].includes(issue));
  if (invalid) {
    decision = "INVALID";
    reason = issues.join("|");
  } else if (resolved.finalDecision === "OMIT") {
    decision = "OMIT";
    reason = "Decisión humana OMIT en el mapping.";
  } else if (resolved.finalDecision === "CREATE_HISTORICAL") {
    decision = "REVIEW";
    reason = "HISTORICAL_PRODUCT_REQUIRED";
  } else if (resolved.finalDecision === "CREATE_CURRENT_PRODUCT_REQUIRED") {
    decision = "REVIEW";
    reason = "CURRENT_PRODUCT_REQUIRED";
  } else if (explicitReviewReason) {
    decision = "REVIEW";
    reason = explicitReviewReason;
  } else if (!resolved.product || effectiveIssues.length > 0) {
    decision = "REVIEW";
    reason = effectiveIssues.length ? effectiveIssues.join("|") : "Mapping humano pendiente.";
  }
  return {
    source_sheet: "Control de ventas",
    source_row: row.sourceRow,
    split_line: "",
    record_type: "sale",
    source_product_name: row.productName,
    matched_product_id: resolved.product?.id ?? "",
    matched_product_name: resolved.product?.name ?? "",
    date: row.date ?? "",
    source_quantity: row.quantity,
    source_total: row.total,
    quantity: row.quantity,
    unit_amount: row.unitPrice,
    total: row.total,
    decision,
    readiness_status: readinessStatus(decision, reason),
    reason,
    fingerprint: fingerprint([inputHash, "Control de ventas", row.sourceRow, row.date, normalize(row.productName), row.quantity, roundMoney(row.unitPrice), roundMoney(row.total), normalize(row.paymentMethod), row.debt]),
  };
}

function classifyPurchase(row: PurchaseSource): DryRunRow {
  const issues = purchaseIssues(row);
  const resolved = resolveFinalProduct(row.productName, row.match);
  const explicitReviewReason = text(manualMappingByName.get(row.productName)?.decision_reason);
  const effectiveIssues = resolved.product
    ? issues.filter((issue) => !["PRODUCTO_AMBIGUO", "PRODUCTO_NO_ENCONTRADO"].includes(issue))
    : issues;
  let decision: Decision = "INSERT";
  let reason = "Fila válida y producto resuelto; candidata a compra histórica sin proveedor y sin efecto de inventario/costo.";
  const invalid = issues.some((issue) => ["PRODUCTO_VACIO", "CANTIDAD_INVALIDA", "COSTO_INVALIDO", "TOTAL_INVALIDO"].includes(issue));
  if (invalid) {
    decision = "INVALID";
    reason = issues.join("|");
  } else if (resolved.finalDecision === "OMIT") {
    decision = "OMIT";
    reason = "Decisión humana OMIT en el mapping.";
  } else if (resolved.finalDecision === "CREATE_HISTORICAL") {
    decision = "REVIEW";
    reason = "HISTORICAL_PRODUCT_REQUIRED";
  } else if (resolved.finalDecision === "CREATE_CURRENT_PRODUCT_REQUIRED") {
    decision = "REVIEW";
    reason = "CURRENT_PRODUCT_REQUIRED";
  } else if (explicitReviewReason) {
    decision = "REVIEW";
    reason = explicitReviewReason;
  } else if (!resolved.product || effectiveIssues.length > 0) {
    decision = "REVIEW";
    reason = effectiveIssues.length ? effectiveIssues.join("|") : "Mapping humano pendiente.";
  }
  return {
    source_sheet: "Control de compras",
    source_row: row.sourceRow,
    split_line: "",
    record_type: "purchase",
    source_product_name: row.productName,
    matched_product_id: resolved.product?.id ?? "",
    matched_product_name: resolved.product?.name ?? "",
    date: row.date ?? "",
    source_quantity: row.quantity,
    source_total: row.total,
    quantity: row.quantity,
    unit_amount: row.unitCost,
    total: row.total,
    decision,
    readiness_status: readinessStatus(decision, reason),
    reason,
    fingerprint: fingerprint([inputHash, "Control de compras", row.sourceRow, row.date, normalize(row.productName), row.quantity, roundMoney(row.unitCost), roundMoney(row.total), roundMoney(row.shipping)]),
  };
}

type PurchaseSplitOverride = {
  expectedDate: string;
  expectedName: string;
  expectedQuantity: number;
  expectedUnitCost: number;
  expectedTotal: number;
  lines: Array<{ productId: string; quantity: number }>;
};

const purchaseSplitOverrides = new Map<number, PurchaseSplitOverride>([
  [58, {
    expectedDate: "2026-01-22",
    expectedName: "Canasta matera",
    expectedQuantity: 2,
    expectedUnitCost: 8999,
    expectedTotal: 17998,
    lines: [
      { productId: "4d304204-8569-464a-b856-29a84bdee6c8", quantity: 1 },
      { productId: "3e33942f-1d42-4b03-b30d-97da131b2cba", quantity: 1 },
    ],
  }],
  [142, {
    expectedDate: "2026-03-20",
    expectedName: "Porta mate cuero",
    expectedQuantity: 3,
    expectedUnitCost: 7150,
    expectedTotal: 21450,
    lines: [
      { productId: "165c4d74-286a-4882-9370-e47001f85e95", quantity: 2 },
      { productId: "a2843178-0691-4a35-bb30-b475b3e941ff", quantity: 1 },
    ],
  }],
]);

function classifyPurchaseRows(row: PurchaseSource): DryRunRow[] {
  const override = purchaseSplitOverrides.get(row.sourceRow);
  if (!override) return [classifyPurchase(row)];

  const sourceMatches = row.date === override.expectedDate
    && row.productName === override.expectedName
    && row.quantity === override.expectedQuantity
    && roundMoney(row.unitCost) === roundMoney(override.expectedUnitCost)
    && roundMoney(row.total) === roundMoney(override.expectedTotal);
  if (!sourceMatches) throw new Error(`La fila ${row.sourceRow} ya no coincide con el split humano aprobado.`);

  const quantityTotal = override.lines.reduce((sum, line) => sum + line.quantity, 0);
  const splitTotal = roundMoney(override.lines.reduce((sum, line) => sum + line.quantity * override.expectedUnitCost, 0));
  if (quantityTotal !== override.expectedQuantity || splitTotal !== roundMoney(override.expectedTotal)) {
    throw new Error(`El split humano de la fila ${row.sourceRow} no reconcilia cantidad o total.`);
  }

  return override.lines.map((line, index) => {
    const product = products.find((candidate) => candidate.id === line.productId);
    if (!product) throw new Error(`El producto ${line.productId} del split de la fila ${row.sourceRow} no existe en el snapshot.`);
    const lineTotal = roundMoney(line.quantity * override.expectedUnitCost);
    return {
      source_sheet: "Control de compras",
      source_row: row.sourceRow,
      split_line: index + 1,
      record_type: "purchase",
      source_product_name: row.productName,
      matched_product_id: product.id,
      matched_product_name: product.name,
      date: row.date ?? "",
      source_quantity: row.quantity,
      source_total: row.total,
      quantity: line.quantity,
      unit_amount: row.unitCost,
      total: lineTotal,
      decision: "INSERT",
      readiness_status: "READY",
      reason: "HUMAN_CONFIRMED_SPLIT",
      fingerprint: fingerprint([inputHash, "Control de compras", row.sourceRow, "split", index + 1, product.id, line.quantity, roundMoney(row.unitCost), lineTotal]),
    };
  });
}

const dryRunRows = [...sales.map(classifySale), ...historicalPurchases.flatMap(classifyPurchaseRows)];
const salesReviewRows = sales.flatMap((row) => {
  const issues = saleIssues(row);
  if (!issues.length) return [];
  return [{
    source_row: row.sourceRow,
    date: row.date ?? "",
    product_name: row.productName,
    quantity: row.quantity ?? "",
    unit_price: formatMoney(row.unitPrice),
    total: formatMoney(row.total),
    issue: issues.join("|"),
    suggested_action: row.match.type === "AMBIGUOUS" || row.match.type === "NOT_FOUND"
      ? "Resolver mapping; luego revisar las demás anomalías de la fila."
      : row.duplicateRows.length || row.databaseCandidates.length
        ? "Verificar comprobante/origen antes de importar."
        : "Corregir o aprobar manualmente el dato fuente.",
    import_decision: "REVIEW",
  }];
});

const purchasesReviewRows = historicalPurchases.flatMap((row) => {
  const issues = purchaseIssues(row);
  if (!issues.length) return [];
  return [{
    source_row: row.sourceRow,
    date: row.date ?? "",
    product_name: row.productName,
    quantity: row.quantity ?? "",
    unit_cost: formatMoney(row.unitCost),
    total: formatMoney(row.total),
    issue: issues.join("|"),
    suggested_action: !row.date
      ? "Completar/confirmar la fecha antes de importar."
      : row.match.type === "AMBIGUOUS" || row.match.type === "NOT_FOUND"
        ? "Resolver mapping del producto."
        : "Revisar manualmente la anomalía.",
    import_decision: "REVIEW",
  }];
});

const [previousHumanMappingRows, previousHumanSalesRows, previousHumanPurchaseRows] = await Promise.all([
  readCsvRows(humanMappingReviewPath),
  readCsvRows(humanSalesReviewPath),
  readCsvRows(humanPurchasesReviewPath),
]);
const previousHumanMappingByName = new Map(previousHumanMappingRows.map((row) => [text(row.excel_name), row]));
const previousHumanSalesByRow = new Map(previousHumanSalesRows.map((row) => [Number(row.source_row), row]));
const previousHumanPurchaseByRow = new Map(previousHumanPurchaseRows.map((row) => [Number(row.source_row), row]));

const canonicalProposalByName = new Map([
  ["Lattafa Yara rosa", "05b34469-3eb8-4148-8e97-9a19f1c2df6e"],
  ["Lattafa Yara Rosa", "05b34469-3eb8-4148-8e97-9a19f1c2df6e"],
  ["Lattafa Yara Tous", "e53066cc-9c35-47e2-8d27-0fe5fb425ce8"],
]);

function mappingEconomicImpact(name: string) {
  return [...sales, ...historicalPurchases]
    .filter((row) => row.productName === name)
    .reduce((sum, row) => sum + (row.total ?? 0), 0);
}

const humanMappingRows = unresolvedNames.map((name) => {
  const match = getMatch(name);
  const proposalId = canonicalProposalByName.get(name);
  const genericSuggestions = match.type === "AMBIGUOUS"
    ? match.candidates.map((product) => ({ product, score: 1 }))
    : findSuggestions(name, products);
  const suggestions = proposalId
    ? [
        ...genericSuggestions.filter((entry) => entry.product.id === proposalId),
        ...genericSuggestions.filter((entry) => entry.product.id !== proposalId),
      ]
    : genericSuggestions;
  const occurrences = [...sales, ...historicalPurchases].filter((row) => row.productName === name);
  const dates = occurrences.map((row) => row.date).filter((date): date is string => Boolean(date)).sort();
  const previous = previousHumanMappingByName.get(name);
  const topReason = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion) return "";
    if (proposalId === suggestion.product.id) {
      return `Candidato canónico propuesto por stock/completitud; sigue requiriendo confirmación humana. Slug ${suggestion.product.slug}.`;
    }
    if (match.type === "AMBIGUOUS") return `Producto real dentro del conjunto ambiguo. Slug ${suggestion.product.slug}.`;
    return `Sugerencia no vinculante por tokens/SKU/similitud textual ${suggestion.score.toFixed(2)}. Slug ${suggestion.product.slug}.`;
  };
  const recommendedDecision = proposalId
    ? "MATCH"
    : match.type === "AMBIGUOUS"
      ? "REVIEW"
      : suggestions[0]?.score >= 0.82
        ? "MATCH"
        : suggestions.length === 0
          ? "CREATE_LATER"
          : "REVIEW";
  return {
    excel_name: name,
    occurrences: occurrences.length,
    first_date: dates[0] ?? "",
    last_date: dates.at(-1) ?? "",
    top_candidate_1_name: suggestions[0]?.product.name ?? "",
    top_candidate_1_id: suggestions[0]?.product.id ?? "",
    top_candidate_1_reason: topReason(0),
    top_candidate_2_name: suggestions[1]?.product.name ?? "",
    top_candidate_2_id: suggestions[1]?.product.id ?? "",
    top_candidate_2_reason: topReason(1),
    exact_issue: match.type,
    recommended_decision: recommendedDecision,
    final_product_id: previous ? text(previous.final_product_id) : "",
    final_decision: previous ? text(previous.final_decision) : proposalId ? "REVIEW" : "",
    human_notes: previous ? text(previous.human_notes) : "",
    historical_group_key: previous ? text(previous.historical_group_key) : "",
    decision_reason: previous ? text(previous.decision_reason) : "",
    _economicImpact: mappingEconomicImpact(name),
  };
}).sort((left, right) =>
  right.occurrences - left.occurrences
  || right._economicImpact - left._economicImpact
  || Number(right.exact_issue === "AMBIGUOUS") - Number(left.exact_issue === "AMBIGUOUS")
  || left.excel_name.localeCompare(right.excel_name, "es"),
);

const resolvedMappingDecisions = new Set(["MATCH", "CREATE_HISTORICAL", "CREATE_CURRENT_PRODUCT_REQUIRED", "OMIT", "SPLIT_BY_SOURCE_ROW"]);
const pendingMappingRows = humanMappingRows.filter((row) => !resolvedMappingDecisions.has(text(row.final_decision).toUpperCase()));
const pendingMappingNameSet = new Set(pendingMappingRows.map((row) => row.excel_name));

function saleHumanRecommendation(row: SaleSource, issues: string[]) {
  if (issues.includes("PRECIO_INVALIDO") || issues.includes("TOTAL_INVALIDO")) return "REVIEW";
  if (issues.includes("TOTAL_INCONSISTENTE")) return "IMPORT_WITH_CORRECTION";
  return "REVIEW";
}

const humanSalesRows = sales.flatMap((row) => {
  const issues = saleIssues(row);
  if (!issues.length) return [];
  const previous = previousHumanSalesByRow.get(row.sourceRow);
  const calculated = row.quantity != null && row.unitPrice != null ? roundMoney(row.quantity * row.unitPrice) : null;
  const difference = calculated != null && row.total != null ? roundMoney(row.total - calculated) : null;
  const generatedNotes: string[] = [];
  if (issues.includes("PRECIO_INVALIDO") || issues.includes("TOTAL_INVALIDO")) {
    generatedNotes.push("Dos decants del mismo día figuran con efectivo, precio, total y margen cero: podría ser regalo, bonificación o dato faltante; no hay evidencia concluyente.");
  }
  if (issues.includes("TOTAL_INCONSISTENTE")) {
    generatedNotes.push(`Total calculado ${formatMoney(calculated)}; total informado ${formatMoney(row.total)}; diferencia ${formatMoney(difference)}.`);
  }
  if (row.duplicateRows.length) generatedNotes.push(`Comparar comprobantes de las filas ${row.duplicateRows.join(", ")}; no omitir automáticamente.`);
  if (row.debt) generatedNotes.push(`Campo DEBE: ${row.debt.replace(/\r?\n/g, " ")}.`);
  return [{
    source_row: row.sourceRow,
    date: row.date ?? "",
    product_name: row.productName,
    quantity: row.quantity ?? "",
    unit_price: formatMoney(row.unitPrice),
    total: formatMoney(row.total),
    issue: issues.join("|"),
    impact_amount: formatMoney(row.total),
    recommended_decision: saleHumanRecommendation(row, issues),
    final_decision: previous ? text(previous.final_decision) : "",
    notes: previous ? text(previous.notes) : generatedNotes.join(" "),
  }];
});

function surroundingPurchaseContext(row: PurchaseSource) {
  const before = [...historicalPurchases].reverse().find((candidate) => candidate.sourceRow < row.sourceRow && candidate.date);
  const after = historicalPurchases.find((candidate) => candidate.sourceRow > row.sourceRow && candidate.date);
  return `Anterior fechada: fila ${before?.sourceRow ?? "-"}, ${before?.date ?? "sin fecha"}, ${before?.productName ?? "-"}. Posterior fechada: fila ${after?.sourceRow ?? "-"}, ${after?.date ?? "sin fecha"}, ${after?.productName ?? "-"}. Intervalo solo orientativo; no asignar fecha automáticamente.`;
}

const humanPurchaseRows = historicalPurchases.flatMap((row) => {
  const issues = purchaseIssues(row);
  if (!issues.length) return [];
  const previous = previousHumanPurchaseByRow.get(row.sourceRow);
  const generatedNotes = issues.includes("FECHA_AUSENTE") ? surroundingPurchaseContext(row) : "";
  const recommendedDecision = issues.includes("FECHA_AUSENTE") && !issues.some((issue) => issue.startsWith("PRODUCTO_"))
    ? "IMPORT_WITH_CORRECTION"
    : "REVIEW";
  return [{
    source_row: row.sourceRow,
    date: row.date ?? "",
    product_name: row.productName,
    quantity: row.quantity ?? "",
    unit_cost: formatMoney(row.unitCost),
    total: formatMoney(row.total),
    issue: issues.join("|"),
    impact_amount: formatMoney(row.total),
    recommended_decision: recommendedDecision,
    final_decision: previous ? text(previous.final_decision) : "",
    notes: previous ? text(previous.notes) : generatedNotes,
  }];
});

const ambiguousNames = unresolvedNames.filter((name) => getMatch(name).type === "AMBIGUOUS");
const categoryById = new Map(categories.map((category) => [category.id, category]));
const currentReferences = new Map<string, { orders: string[]; purchases: string[] }>();
for (const product of products) currentReferences.set(product.id, { orders: [], purchases: [] });
for (const item of orderItems) if (item.product_id) currentReferences.get(item.product_id)?.orders.push(item.order_id);
for (const item of purchaseItems) currentReferences.get(item.product_id)?.purchases.push(item.purchase_id);

function canonicalRecommendation(candidates: ProductRow[]) {
  const scored = candidates.map((product) => {
    const refs = currentReferences.get(product.id);
    const productAttributes = attributes.filter((attribute) => attribute.product_id === product.id);
    const productImages = images.filter((image) => image.product_id === product.id);
    const score = (product.status === "active" ? 3 : 0)
      + (refs?.orders.length ?? 0) * 5
      + (refs?.purchases.length ?? 0) * 5
      + (productImages.length ? 2 : 0)
      + (productAttributes.length ? 1 : 0)
      + (product.stock > 0 ? 1 : 0);
    return { product, score, refs, productAttributes, productImages };
  }).sort((left, right) => right.score - left.score || left.product.created_at.localeCompare(right.product.created_at));
  if (scored.length < 2 || scored[0].score === scored[1].score) {
    return { scored, recommendation: "No hay evidencia técnica suficiente para elegir un registro canónico; requiere decisión humana." };
  }
  return {
    scored,
    recommendation: `El registro ${scored[0].product.id} parece el mejor candidato canónico por actividad/referencias/completitud, pero no debe fusionarse sin revisión humana.`,
  };
}

const decisionCounts = {
  sales: countBy(dryRunRows.filter((row) => row.record_type === "sale"), (row) => row.decision),
  purchases: countBy(dryRunRows.filter((row) => row.record_type === "purchase"), (row) => row.decision),
};
const insertedRows = dryRunRows.filter((row) => row.decision === "INSERT");
const insertedSales = insertedRows.filter((row) => row.record_type === "sale");
const insertedPurchases = insertedRows.filter((row) => row.record_type === "purchase");
const distinctAffectedProducts = new Set(insertedRows.map((row) => row.matched_product_id).filter(Boolean));

const mappingHeaders = [
  "excel_name", "source_sheet", "occurrences", "first_date", "last_date", "suggested_product_id", "suggested_product_name",
  "suggestion_type", "confidence_reason", "requires_human_review", "final_product_id", "final_decision", "notes", "historical_group_key", "decision_reason",
];
const salesReviewHeaders = ["source_row", "date", "product_name", "quantity", "unit_price", "total", "issue", "suggested_action", "import_decision"];
const purchasesReviewHeaders = ["source_row", "date", "product_name", "quantity", "unit_cost", "total", "issue", "suggested_action", "import_decision"];
const dryRunHeaders = [
  "source_sheet", "source_row", "split_line", "record_type", "source_product_name", "matched_product_id", "matched_product_name",
  "date", "source_quantity", "source_total", "quantity", "unit_amount", "total", "decision", "readiness_status", "reason", "fingerprint",
];
const humanMappingHeaders = [
  "excel_name", "occurrences", "first_date", "last_date", "top_candidate_1_name", "top_candidate_1_id", "top_candidate_1_reason",
  "top_candidate_2_name", "top_candidate_2_id", "top_candidate_2_reason", "exact_issue", "recommended_decision",
  "final_product_id", "final_decision", "human_notes", "historical_group_key", "decision_reason",
];
const humanSalesHeaders = [
  "source_row", "date", "product_name", "quantity", "unit_price", "total", "issue", "impact_amount",
  "recommended_decision", "final_decision", "notes",
];
const humanPurchasesHeaders = [
  "source_row", "date", "product_name", "quantity", "unit_cost", "total", "issue", "impact_amount",
  "recommended_decision", "final_decision", "notes",
];

const markdown: string[] = [];
markdown.push("# Dry-run de migración histórica de SFSTORE", "");
markdown.push("> Ejecución de solo lectura. El script no contiene operaciones INSERT, UPDATE, DELETE ni RPC sobre Supabase.", "");
markdown.push("## Fuente", "");
markdown.push(`- Archivo: \`${inputPath}\``);
markdown.push(`- Tamaño: ${inputStats.size.toLocaleString("es-AR")} bytes.`);
markdown.push(`- SHA-256: \`${inputHash}\`.`);
markdown.push(`- Ventas evaluadas: ${sales.length}.`);
markdown.push(`- Compras evaluadas: ${historicalPurchases.length}.`, "");

markdown.push("## Resultado exacto", "");
markdown.push("| Tipo | INSERT | OMIT | REVIEW | INVALID |", "|---|---:|---:|---:|---:|");
for (const [label, counts] of [["Ventas", decisionCounts.sales], ["Compras", decisionCounts.purchases]] as const) {
  markdown.push(`| ${label} | ${counts.get("INSERT") ?? 0} | ${counts.get("OMIT") ?? 0} | ${counts.get("REVIEW") ?? 0} | ${counts.get("INVALID") ?? 0} |`);
}
markdown.push("");
markdown.push("## Estado de preparación", "");
markdown.push("| Estado | Filas |", "|---|---:|");
for (const [status, count] of [...countBy(dryRunRows, (row) => row.readiness_status).entries()].sort()) {
  markdown.push(`| ${status} | ${count} |`);
}
markdown.push("", "`HISTORICAL_PRODUCT_READY` conserva la decisión REVIEW: indica que la identidad histórica ya fue resuelta y podrá pasar a INSERT cuando exista el producto archivado.", "");
markdown.push(`- Productos distintos en filas INSERT: ${distinctAffectedProducts.size}.`);
markdown.push(`- Total de ventas INSERT: $${formatMoney(insertedSales.reduce((sum, row) => sum + (row.total ?? 0), 0))}.`);
markdown.push(`- Total de compras INSERT: $${formatMoney(insertedPurchases.reduce((sum, row) => sum + (row.total ?? 0), 0))}.`);
markdown.push(`- Orders/order_items esperados: ${insertedSales.length}/${insertedSales.length}; no se agrupan filas porque el Excel no tiene ID ni hora de venta.`);
const insertedPurchaseSourceRows = new Set(insertedPurchases.map((row) => row.source_row));
markdown.push(`- Purchases/purchase_items esperados: ${insertedPurchaseSourceRows.size}/${insertedPurchases.length}; cada fila fuente genera una compra, salvo splits humanos que generan varios ítems reconciliados.`);
markdown.push(`- Pagos históricos esperados: ${insertedSales.filter((row) => {
  const sale = sales.find((candidate) => candidate.sourceRow === row.source_row);
  return sale ? Boolean(mapPaymentMethod(sale.paymentMethod)) && !sale.debt : false;
}).length}.`);
markdown.push(`- Mappings pendientes: ${pendingMappingRows.length}.`);
markdown.push(`- Duplicados potenciales dentro del Excel: ${salesDuplicateGroups.length} grupos de ventas y ${purchaseDuplicateGroups.length} grupos de compras.`);
markdown.push(`- Candidatos contra operaciones actuales: ${sales.filter((row) => row.databaseCandidates.length).length} ventas y ${historicalPurchases.filter((row) => row.databaseCandidates.length).length} compras.`, "");
markdown.push("## Splits humanos reconciliados", "");
for (const [sourceRow, override] of purchaseSplitOverrides) {
  const splitRows = insertedPurchases.filter((row) => row.source_row === sourceRow);
  markdown.push(`### Control de compras fila ${sourceRow}: ${override.expectedName}`, "");
  markdown.push(`- Fuente: ${override.expectedQuantity} unidades x $${formatMoney(override.expectedUnitCost)} = $${formatMoney(override.expectedTotal)}.`);
  for (const row of splitRows) markdown.push(`- Línea ${row.split_line}: ${row.quantity} x ${row.matched_product_name} (${row.matched_product_id}) = $${formatMoney(row.total)}.`);
  markdown.push(`- Reconciliación: ${splitRows.reduce((sum, row) => sum + (row.quantity ?? 0), 0)} unidades; $${formatMoney(splitRows.reduce((sum, row) => sum + (row.total ?? 0), 0))}.`, "");
}
markdown.push("## Snapshot de Production consultado", "");
markdown.push(`- Productos: ${products.length}.`);
markdown.push(`- Proveedores: ${suppliers.length}.`);
markdown.push(`- Compras / ítems: ${purchases.length} / ${purchaseItems.length}.`);
markdown.push(`- Órdenes / ítems / pagos: ${orders.length} / ${orderItems.length} / ${orderPayments.length}.`);
markdown.push("- Operaciones ejecutadas contra Supabase: exclusivamente SELECT.", "");

markdown.push("## Duplicados actuales en products", "");
for (const name of ambiguousNames) {
  const match = getMatch(name);
  const analysis = canonicalRecommendation(match.candidates);
  markdown.push(`### ${name}`, "");
  markdown.push("| ID | Nombre | Slug | Status | Stock | Price | Transfer | Cost | Categoría | Atributos | Imágenes | Principal | Creado | Órdenes | Compras |", "|---|---|---|---|---:|---:|---:|---:|---|---:|---:|---|---|---:|---:|");
  for (const entry of analysis.scored) {
    const category = categoryById.get(entry.product.category_id);
    const primary = entry.productImages.find((image) => image.is_primary)?.url ?? "";
    markdown.push(`| ${entry.product.id} | ${escapeMarkdown(entry.product.name)} | ${entry.product.slug} | ${entry.product.status} | ${entry.product.stock} | ${formatMoney(Number(entry.product.price))} | ${formatMoney(entry.product.transfer_price == null ? null : Number(entry.product.transfer_price))} | ${formatMoney(entry.product.cost == null ? null : Number(entry.product.cost))} | ${escapeMarkdown(category?.name ?? "")} | ${entry.productAttributes.length} | ${entry.productImages.length} | ${escapeMarkdown(primary)} | ${entry.product.created_at} | ${entry.refs?.orders.length ?? 0} | ${entry.refs?.purchases.length ?? 0} |`);
  }
  markdown.push("", analysis.recommendation, "");
  for (const entry of analysis.scored) {
    const attributeText = entry.productAttributes
      .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name, "es"))
      .map((attribute) => `${attribute.name}=${attribute.value}`).join("; ") || "sin atributos";
    markdown.push(`- ${entry.product.id}: ${attributeText}. Imágenes: ${entry.productImages.map((image) => image.url).join("; ") || "sin imágenes"}.`);
  }
  markdown.push("");
}

markdown.push("## Mappings no resueltos", "");
markdown.push(`Los ${pendingMappingRows.length} casos pendientes están en \`reports/historical-product-mapping-review.csv\`. Las sugerencias fuzzy y por tokens son informativas; el Excel transaccional no contiene SKU.`, "");

markdown.push("## Ventas problemáticas", "");
markdown.push(`Filas de revisión: ${salesReviewRows.length}. Incluyen producto sin mapping, ambigüedad, total inconsistente, cero, deuda y duplicados potenciales. El detalle está en \`reports/historical-sales-review.csv\`.`, "");
markdown.push("Los medios observados se pueden mapear conservadoramente: `Efectivo -> cash`, `Transferencia -> transfer`, `Crédito/Débito -> card`. Se conserva siempre el texto original. Una fila con `DEBE` queda en REVIEW y no genera pago.", "");

markdown.push("## Compras problemáticas", "");
markdown.push(`Filas de revisión: ${purchasesReviewRows.length}. Las seis filas sin fecha permanecen en REVIEW. El detalle está en \`reports/historical-purchases-review.csv\`.`, "");
markdown.push("Las líneas de compra no contienen proveedor. Las listas auxiliares no pueden asignarse a una operación concreta; el modelo histórico debe permitir `supplier_id = NULL` solo cuando `historical_import=true`.", "");

markdown.push("## Diseño futuro de base de datos", "");
markdown.push("### historical_import_records", "");
markdown.push("Campos propuestos: `id uuid PK`, `import_batch_id uuid`, `source_file text`, `source_file_sha256 text`, `source_sheet text`, `source_row integer`, `fingerprint text`, `record_type text`, `target_table text`, `target_id uuid`, `result text`, `notes text`, `created_at timestamptz`. Restricción única: `(source_file_sha256, source_sheet, source_row, fingerprint)`. RLS habilitado y acceso solo service role.", "");
markdown.push("### purchases", "");
markdown.push("Agregar `historical_import boolean not null default false`, `affects_inventory boolean not null default true`, `import_source text`, `historical_occurred_on date`, `historical_import_record_id uuid unique`. Ampliar status con `historical`. Permitir `supplier_id` y `supplier_name_snapshot` nulos exclusivamente cuando `historical_import=true`. Las compras históricas serán inmutables, no tendrán `confirmed_at` operativo y no usarán `confirm_purchase`.", "");
markdown.push("### orders", "");
markdown.push("Agregar `channel='historical'`, `status='historical'`, `historical_import boolean not null default false`, `affects_inventory boolean not null default true`, `import_source text`, `historical_occurred_on date` y `historical_import_record_id uuid unique`. No usar `complete_store_sale`, `apply_sale_inventory` ni `deliver_order`.", "");
markdown.push("### Defensas", "");
markdown.push("RPCs futuras `import_historical_purchase` e `import_historical_sale`, transaccionales y service-role only. Triggers deben impedir `inventory_movements` y cambios de stock/costo para `affects_inventory=false`. Los registros históricos deben ser inmutables después de insertados.", "");

markdown.push("## Pagos históricos", "");
markdown.push("Crear `order_payments` solo cuando el medio esté presente, sea mapeable y no exista deuda informada. Mantener el texto fuente en metadata/notas. Para filas sin evidencia suficiente, no inventar pago y usar `payment_status='unknown'`, valor que requerirá ampliación explícita del constraint. No usar `other` como relleno.", "");

markdown.push("## Fechas", "");
markdown.push("La fecha fuente se conserva en `historical_occurred_on date`. Si se necesita `created_at timestamptz` histórico, derivarlo a las 12:00:00 de `America/Argentina/Buenos_Aires`; el campo `date` sigue siendo la fuente autoritativa para evitar cambios de día por UTC.", "");

markdown.push("## Invariantes obligatorias para una ejecución futura", "");
markdown.push("Antes y después del lote deben ser idénticos:", "");
markdown.push("- hash ordenado de `products(id, stock)` y suma global de stock;");
markdown.push("- hash ordenado de `products(id, cost, cost_source_purchase_item_id)`;");
markdown.push("- cantidad y hash ordenado completo de `inventory_movements`;");
markdown.push("- ninguna llamada a `confirm_purchase`, `complete_store_sale`, `apply_sale_inventory` o `deliver_order`;");
markdown.push("- cantidad de mappings aprobados igual a la cantidad de nombres no deterministas que se pretende insertar.", "");

markdown.push("## Condiciones antes de implementar", "");
markdown.push(`1. Resolver manualmente los ${pendingMappingRows.length} mappings pendientes o marcar cada uno como OMIT.`);
markdown.push("2. Resolver las filas de ventas/compras en REVIEW e INVALID.");
markdown.push("3. Aprobar el modelo `historical`, la nulabilidad acotada de proveedor y `payment_status='unknown'`.");
markdown.push("4. Crear y revisar una migration versionada; no aplicar SQL improvisado.");
markdown.push("5. Repetir este dry-run contra el snapshot inmediato de Production antes de cualquier escritura.", "");

const unresolvedSales = sales.filter((row) => pendingMappingNameSet.has(row.productName));
const unresolvedPurchases = historicalPurchases.filter((row) => pendingMappingNameSet.has(row.productName));
const unresolvedSalesImpact = unresolvedSales.reduce((sum, row) => sum + (row.total ?? 0), 0);
const unresolvedPurchasesImpact = unresolvedPurchases.reduce((sum, row) => sum + (row.total ?? 0), 0);
const reviewSalesDryRun = dryRunRows.filter((row) => row.record_type === "sale" && row.decision === "REVIEW");
const invalidSalesDryRun = dryRunRows.filter((row) => row.record_type === "sale" && row.decision === "INVALID");
const reviewPurchasesDryRun = dryRunRows.filter((row) => row.record_type === "purchase" && row.decision === "REVIEW");
const salesReviewImpact = reviewSalesDryRun.reduce((sum, row) => sum + (row.total ?? 0), 0);
const invalidSalesImpact = invalidSalesDryRun.reduce((sum, row) => sum + (row.total ?? 0), 0);
const purchasesReviewImpact = reviewPurchasesDryRun.reduce((sum, row) => sum + (row.total ?? 0), 0);
const totalWithheld = salesReviewImpact + invalidSalesImpact + purchasesReviewImpact;
const zeroSales = sales.filter((row) => row.unitPrice === 0 || row.total === 0);
const inconsistentSales = sales.filter((row) => row.quantity != null && row.unitPrice != null && row.total != null
  && Math.abs((roundMoney(row.quantity * row.unitPrice) ?? 0) - (roundMoney(row.total) ?? 0)) > 0.01);
const undatedPurchases = historicalPurchases.filter((row) => !row.date);

const humanSummary: string[] = [];
humanSummary.push("# Revisión humana de migración histórica", "");
humanSummary.push("> Documento de preparación. No asigna mappings finales, no corrige filas y no escribe en Supabase.", "");
humanSummary.push("## Resumen", "");
humanSummary.push(`- Mappings pendientes: ${pendingMappingRows.length}.`);
humanSummary.push(`- Ventas problemáticas: ${humanSalesRows.length} filas; dry-run: ${reviewSalesDryRun.length} REVIEW y ${invalidSalesDryRun.length} INVALID.`);
humanSummary.push(`- Compras problemáticas: ${humanPurchaseRows.length} filas; dry-run: ${reviewPurchasesDryRun.length} REVIEW.`);
humanSummary.push(`- Duplicados potenciales: ${salesDuplicateGroups.length} grupos de ventas; no se detectaron grupos de compras.`);
humanSummary.push(`- Compras sin fecha: ${undatedPurchases.length}.`, "");

humanSummary.push("## Impacto económico", "");
humanSummary.push("Los importes se superponen: el impacto de mappings no resueltos está contenido en las filas REVIEW y no debe sumarse otra vez.", "");
humanSummary.push("| Conjunto | Ventas | Compras | Total |", "|---|---:|---:|---:|");
humanSummary.push(`| Mappings no resueltos | ${formatMoney(unresolvedSalesImpact)} | ${formatMoney(unresolvedPurchasesImpact)} | ${formatMoney(unresolvedSalesImpact + unresolvedPurchasesImpact)} |`);
humanSummary.push(`| Filas REVIEW | ${formatMoney(salesReviewImpact)} | ${formatMoney(purchasesReviewImpact)} | ${formatMoney(salesReviewImpact + purchasesReviewImpact)} |`);
humanSummary.push(`| Filas INVALID | ${formatMoney(invalidSalesImpact)} | 0.00 | ${formatMoney(invalidSalesImpact)} |`);
humanSummary.push("");
humanSummary.push(`Si no se resuelve ninguna fila pendiente, quedarían fuera de la importación $${formatMoney(totalWithheld)}: $${formatMoney(salesReviewImpact + invalidSalesImpact)} de ventas y $${formatMoney(purchasesReviewImpact)} de compras.`, "");

humanSummary.push("## Propuesta Yara", "");
humanSummary.push("| Nombre Excel | Candidato canónico propuesto | Alternativa | Estado final |", "|---|---|---|---|");
for (const name of ["Lattafa Yara rosa", "Lattafa Yara Rosa", "Lattafa Yara Tous"]) {
  const row = humanMappingRows.find((candidate) => candidate.excel_name === name);
  if (row) humanSummary.push(`| ${name} | ${row.top_candidate_1_name} (${row.top_candidate_1_id}) | ${row.top_candidate_2_name} (${row.top_candidate_2_id}) | REVIEW |`);
}
humanSummary.push("");
humanSummary.push("La propuesta prioriza `05b34469...` para Yara Rosa y `e53066cc...` para Yara Tous por stock/completitud. No se completó `final_product_id` ni se modificaron productos.", "");

humanSummary.push("## Ventas con precio o total cero", "");
humanSummary.push("| Fila | Fecha | Producto | Cantidad | Precio | Total | Interpretación |", "|---:|---|---|---:|---:|---:|---|");
for (const row of zeroSales) {
  humanSummary.push(`| ${row.sourceRow} | ${row.date ?? ""} | ${escapeMarkdown(row.productName)} | ${row.quantity ?? ""} | ${formatMoney(row.unitPrice)} | ${formatMoney(row.total)} | Podría ser regalo, bonificación o dato faltante; efectivo y margen cero no permiten distinguirlo. REVIEW. |`);
}
humanSummary.push("");

humanSummary.push("## Totales inconsistentes", "");
humanSummary.push("| Fila | Fecha | Producto | Informado | Calculado | Diferencia informado-calculado |", "|---:|---|---|---:|---:|---:|");
for (const row of inconsistentSales) {
  const calculated = roundMoney((row.quantity ?? 0) * (row.unitPrice ?? 0));
  humanSummary.push(`| ${row.sourceRow} | ${row.date ?? ""} | ${escapeMarkdown(row.productName)} | ${formatMoney(row.total)} | ${formatMoney(calculated)} | ${formatMoney(roundMoney((row.total ?? 0) - (calculated ?? 0)))} |`);
}
humanSummary.push("", "No se eligió entre el total informado y el calculado. La recomendación es `IMPORT_WITH_CORRECTION`, pendiente de decisión humana.", "");

humanSummary.push("## Duplicados potenciales de ventas", "");
for (const [index, group] of salesDuplicateGroups.entries()) {
  const first = group[0];
  humanSummary.push(`### Grupo ${index + 1}`, "");
  humanSummary.push(`- Filas: ${group.map((row) => row.sourceRow).join(", ")}.`);
  humanSummary.push(`- Fecha: ${first.date ?? "sin fecha"}.`);
  humanSummary.push(`- Producto: ${first.productName}.`);
  humanSummary.push(`- Cantidad: ${first.quantity}; precio: ${formatMoney(first.unitPrice)}; total: ${formatMoney(first.total)}.`);
  humanSummary.push("- Decisión: REVIEW; no eliminar automáticamente.", "");
}

humanSummary.push("## Compras sin fecha", "");
humanSummary.push("| Fila | Producto | Cantidad | Costo | Total | Contexto |", "|---:|---|---:|---:|---:|---|");
for (const row of undatedPurchases) {
  humanSummary.push(`| ${row.sourceRow} | ${escapeMarkdown(row.productName)} | ${row.quantity ?? ""} | ${formatMoney(row.unitCost)} | ${formatMoney(row.total)} | ${escapeMarkdown(surroundingPurchaseContext(row))} |`);
}
humanSummary.push("", "Las seis están entre una fila fechada el 2026-04-15 y otra fechada el 2026-05-11, pero la hoja no mantiene orden cronológico estricto. Ese intervalo es solo contexto y no autoriza asignar una fecha.", "");

humanSummary.push("## Decisiones humanas necesarias", "");
humanSummary.push("1. Confirmar o rechazar el candidato de cada mapping; completar `final_product_id` y `final_decision` solo después de esa revisión.");
humanSummary.push("2. Decidir si las dos ventas cero fueron regalo/bonificación, dato faltante u operación a omitir.");
humanSummary.push("3. Elegir el total correcto de las cuatro ventas inconsistentes usando comprobantes externos.");
humanSummary.push("4. Determinar si cada par repetido representa dos ventas reales o una duplicación de carga.");
humanSummary.push("5. Completar las seis fechas de compra solo con evidencia externa.");
humanSummary.push("6. Revisar la fila con deuda antes de generar cualquier pago histórico.", "");

await mkdir(reportsDirectory, { recursive: true });
const kobraProduct = products.find((product) => product.id === "8f06198a-0199-407d-9d5d-9e7c38bcd578");
const inventoryAdjustmentRows = [{
  status: "CURRENT_INVENTORY_ADJUSTMENT_REQUIRED",
  product_id: "8f06198a-0199-407d-9d5d-9e7c38bcd578",
  product_name: kobraProduct?.name ?? "Decant hawas Kobra 5ml",
  current_database_stock: kobraProduct?.stock ?? "",
  reported_physical_stock: 0,
  suggested_adjustment: `${kobraProduct?.stock ?? 1} -> 0`,
  reason: "Entregado como regalo junto con venta de perfume",
  required_action: "Realizar después mediante el flujo normal de Inventario; no ajustar desde la migración histórica.",
}];
await Promise.all([
  writeFile(mappingReviewPath, serializeCsv(mappingHeaders, mappingReviewRows), "utf8"),
  writeFile(salesReviewPath, serializeCsv(salesReviewHeaders, salesReviewRows), "utf8"),
  writeFile(purchasesReviewPath, serializeCsv(purchasesReviewHeaders, purchasesReviewRows), "utf8"),
  writeFile(dryRunCsvPath, serializeCsv(dryRunHeaders, dryRunRows), "utf8"),
  writeFile(dryRunMarkdownPath, markdown.join("\n") + "\n", "utf8"),
  writeFile(humanMappingReviewPath, serializeCsv(humanMappingHeaders, humanMappingRows), "utf8"),
  writeFile(humanSalesReviewPath, serializeCsv(humanSalesHeaders, humanSalesRows), "utf8"),
  writeFile(humanPurchasesReviewPath, serializeCsv(humanPurchasesHeaders, humanPurchaseRows), "utf8"),
  writeFile(humanSummaryPath, humanSummary.join("\n") + "\n", "utf8"),
  writeFile(inventoryAdjustmentsPath, serializeCsv([
    "status", "product_id", "product_name", "current_database_stock", "reported_physical_stock",
    "suggested_adjustment", "reason", "required_action",
  ], inventoryAdjustmentRows), "utf8"),
]);

console.log(`Archivo: ${sourceFile}`);
console.log(`SHA-256: ${inputHash}`);
console.log(`Mappings pendientes: ${pendingMappingRows.length}`);
console.log(`Ventas: INSERT ${decisionCounts.sales.get("INSERT") ?? 0}, OMIT ${decisionCounts.sales.get("OMIT") ?? 0}, REVIEW ${decisionCounts.sales.get("REVIEW") ?? 0}, INVALID ${decisionCounts.sales.get("INVALID") ?? 0}`);
console.log(`Compras: INSERT ${decisionCounts.purchases.get("INSERT") ?? 0}, OMIT ${decisionCounts.purchases.get("OMIT") ?? 0}, REVIEW ${decisionCounts.purchases.get("REVIEW") ?? 0}, INVALID ${decisionCounts.purchases.get("INVALID") ?? 0}`);
console.log(`Impacto retenido sin resolver: ${formatMoney(totalWithheld)}`);
console.log("Supabase: solo SELECT; escrituras remotas: 0.");
