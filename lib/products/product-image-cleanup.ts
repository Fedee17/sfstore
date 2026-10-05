export const PRODUCT_IMAGE_CLEANUP_ACTIONS = [
  "KEEP",
  "DELETE_DB",
  "DELETE_STORAGE",
  "DELETE_BOTH",
  "REVIEW",
] as const;

export type ProductImageCleanupAction =
  (typeof PRODUCT_IMAGE_CLEANUP_ACTIONS)[number];

export type ProductImageCleanupPlanRow = {
  action: ProductImageCleanupAction;
  entity_type: string;
  product_id: string;
  product_name: string;
  row_id: string;
  path: string;
  url: string;
  content_hash: string;
  size: number | null;
  mime: string;
  sort_order: number | null;
  is_primary: boolean | null;
  created_at: string;
  reason: string;
  keeper_row_id: string;
  keeper_path: string;
  confidence: string;
};

export const PROTECTED_YARA_ROSA_PRODUCT_IDS = new Set([
  "f1cb2323-0e7f-49d6-a26f-110595c90e55",
  "05b34469-3eb8-4148-8e97-9a19f1c2df6e",
]);

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("El CSV de limpieza tiene comillas sin cerrar.");
  if (value || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((fields) => fields.some((field) => field !== ""));
}

function nullableNumber(value: string) {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Valor numerico invalido: ${value}`);
  return number;
}

function nullableBoolean(value: string) {
  if (!value) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Valor booleano invalido: ${value}`);
}

export function parseProductImageCleanupPlanCsv(text: string) {
  const [headers, ...records] = parseCsv(text);
  if (!headers) throw new Error("El plan de limpieza esta vacio.");

  const required = [
    "action",
    "entity_type",
    "product_id",
    "product_name",
    "row_id",
    "path",
    "url",
    "content_hash",
    "size",
    "mime",
    "sort_order",
    "is_primary",
    "created_at",
    "reason",
    "keeper_row_id",
    "keeper_path",
    "confidence",
  ];
  for (const header of required) {
    if (!headers.includes(header)) throw new Error(`Falta la columna ${header}.`);
  }

  return records.map((fields, recordIndex) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""]));
    if (!PRODUCT_IMAGE_CLEANUP_ACTIONS.includes(record.action as ProductImageCleanupAction)) {
      throw new Error(`Accion invalida en fila ${recordIndex + 2}: ${record.action}`);
    }

    return {
      ...record,
      action: record.action as ProductImageCleanupAction,
      size: nullableNumber(record.size),
      sort_order: nullableNumber(record.sort_order),
      is_primary: nullableBoolean(record.is_primary),
    } as ProductImageCleanupPlanRow;
  });
}

export function assertProtectedProductImageReviews(
  plan: ProductImageCleanupPlanRow[],
) {
  const protectedRows = plan.filter((row) =>
    PROTECTED_YARA_ROSA_PRODUCT_IDS.has(row.product_id),
  );

  for (const productId of PROTECTED_YARA_ROSA_PRODUCT_IDS) {
    const productRows = protectedRows.filter((row) => row.product_id === productId);
    if (productRows.length !== 1 || productRows[0].action !== "REVIEW") {
      throw new Error(
        `El producto protegido ${productId} debe tener exactamente una fila REVIEW.`,
      );
    }
  }

  if (protectedRows.some((row) => row.action !== "REVIEW")) {
    throw new Error("Las identidades protegidas de Yara Rosa no pueden limpiarse.");
  }
}

export function summarizeProductImageCleanupPlan(
  plan: ProductImageCleanupPlanRow[],
) {
  return Object.fromEntries(
    PRODUCT_IMAGE_CLEANUP_ACTIONS.map((action) => [
      action,
      plan.filter((row) => row.action === action).length,
    ]),
  ) as Record<ProductImageCleanupAction, number>;
}
