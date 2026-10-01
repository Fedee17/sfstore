export type CatalogMojibakeAuditEntry = {
  product_id: string;
  name: string;
  field: "description";
  current_value: string;
  proposed_fixed_value: string;
  confidence: string;
  reason: string;
};

export type CatalogDescriptionRepairResult = {
  productId: string;
  name: string;
  action:
    | "DRY_RUN_UPDATE"
    | "UPDATED"
    | "SKIP_ALREADY_CORRECT"
    | "ABORT_REMOTE_CHANGED"
    | "ABORT_NOT_FOUND";
  before: string | null;
  after: string | null;
  message: string;
};

type RemoteProductDescription = {
  id: string;
  description: string | null;
};

type CatalogDescriptionRepairDependencies = {
  loadProduct: (productId: string) => Promise<RemoteProductDescription | null>;
  updateDescription: (
    productId: string,
    expectedCurrentValue: string,
    proposedFixedValue: string,
  ) => Promise<boolean>;
};

function parseCsvRows(content: string) {
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
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
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

  if (quoted) {
    throw new Error("El reporte CSV tiene una comilla sin cerrar.");
  }

  if (value || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((values) => values.some(Boolean));
}

export function parseCatalogMojibakeAudit(
  content: string,
): CatalogMojibakeAuditEntry[] {
  const rows = parseCsvRows(content);
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, ""));

  if (!headers) {
    throw new Error("El reporte de mojibake está vacío.");
  }

  const requiredHeaders = [
    "product_id",
    "name",
    "field",
    "current_value",
    "proposed_fixed_value",
    "confidence",
    "reason",
  ];

  if (requiredHeaders.some((header) => !headers.includes(header))) {
    throw new Error("El reporte de mojibake no tiene todas las columnas requeridas.");
  }

  const entries = rows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    ),
  ) as CatalogMojibakeAuditEntry[];
  const productIds = new Set<string>();

  for (const entry of entries) {
    if (!entry.product_id || !entry.current_value || !entry.proposed_fixed_value) {
      throw new Error("El reporte contiene una reparación incompleta.");
    }

    if (entry.field !== "description") {
      throw new Error(`Campo no permitido en el reporte: ${entry.field}.`);
    }

    if (productIds.has(entry.product_id)) {
      throw new Error(`Product ID duplicado en el reporte: ${entry.product_id}.`);
    }

    productIds.add(entry.product_id);
  }

  return entries;
}

export async function executeCatalogDescriptionRepair(
  entries: CatalogMojibakeAuditEntry[],
  dependencies: CatalogDescriptionRepairDependencies,
  options: { apply: boolean },
) {
  const results: CatalogDescriptionRepairResult[] = [];

  for (const entry of entries) {
    const product = await dependencies.loadProduct(entry.product_id);

    if (!product) {
      results.push({
        productId: entry.product_id,
        name: entry.name,
        action: "ABORT_NOT_FOUND",
        before: null,
        after: null,
        message: "El producto ya no existe; no se escribió ningún dato.",
      });
      continue;
    }

    if (product.description === entry.proposed_fixed_value) {
      results.push({
        productId: entry.product_id,
        name: entry.name,
        action: "SKIP_ALREADY_CORRECT",
        before: product.description,
        after: product.description,
        message: "La descripción ya contiene el valor corregido.",
      });
      continue;
    }

    if (product.description !== entry.current_value) {
      results.push({
        productId: entry.product_id,
        name: entry.name,
        action: "ABORT_REMOTE_CHANGED",
        before: product.description,
        after: product.description,
        message: "La descripción remota cambió desde la auditoría.",
      });
      continue;
    }

    if (!options.apply) {
      results.push({
        productId: entry.product_id,
        name: entry.name,
        action: "DRY_RUN_UPDATE",
        before: product.description,
        after: entry.proposed_fixed_value,
        message: "Se actualizaría únicamente description al ejecutar con --apply.",
      });
      continue;
    }

    const updated = await dependencies.updateDescription(
      entry.product_id,
      entry.current_value,
      entry.proposed_fixed_value,
    );

    results.push(
      updated
        ? {
            productId: entry.product_id,
            name: entry.name,
            action: "UPDATED",
            before: product.description,
            after: entry.proposed_fixed_value,
            message: "Descripción corregida.",
          }
        : {
            productId: entry.product_id,
            name: entry.name,
            action: "ABORT_REMOTE_CHANGED",
            before: product.description,
            after: product.description,
            message: "La comparación optimista falló; no se sobrescribió el dato remoto.",
          },
    );
  }

  return results;
}
