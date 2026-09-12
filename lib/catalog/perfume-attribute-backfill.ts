import {
  MANAGED_CATALOG_ATTRIBUTE_KEYS,
  PERFUME_ATTRIBUTE_FIELDS,
  getAllowedValuesForField,
  getCatalogAttributeNameAliases,
  normalizeCatalogAttributeValue,
  type CatalogAttribute,
} from "./attribute-config.ts";

export type PerfumeCommercialKey =
  | "commercial_category"
  | "olfactory_family"
  | "intensity"
  | "occasion"
  | "gender";

export type BackfillTarget = {
  product_id: string;
  name: string;
  attributes: Record<PerfumeCommercialKey, string[]>;
};

export type BackfillIssue = {
  code: string;
  message: string;
  product_id?: string;
  name?: string;
  field?: PerfumeCommercialKey;
  product_index?: number;
};

export type ValidatedBackfillEntry = {
  index: number;
  product_id: string;
  name: string;
  target: BackfillTarget | null;
};

export type BackfillValidation = {
  schemaVersion: number | null;
  entries: ValidatedBackfillEntry[];
  errors: BackfillIssue[];
  warnings: BackfillIssue[];
};

export type CurrentCommercialAttribute = CatalogAttribute & {
  id?: string;
};

export type BackfillDatabaseProduct = {
  id: string;
  name: string;
  slug: string;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  attributes: CurrentCommercialAttribute[];
};

export type BackfillFieldPlan = {
  field: PerfumeCommercialKey;
  actual: string[];
  desired: string[];
  action: "create" | "replace" | "unchanged";
  simulated_operations: Array<
    | {
        operation: "delete_managed_values";
        names: string[];
      }
    | {
        operation: "insert_values";
        name: PerfumeCommercialKey;
        values: string[];
      }
  >;
};

export type BackfillProductPlan = {
  product_id: string;
  source_name: string;
  current_name: string | null;
  status: "valid" | "invalid" | "missing" | "wrong_category";
  attributes: BackfillFieldPlan[];
};

export type PerfumeBackfillDryRun = {
  summary: {
    productsInFile: number;
    productsFoundInSupabase: number;
    validProducts: number;
    invalidProducts: number;
    attributesToCreate: number;
    attributesToReplace: number;
    attributesUnchanged: number;
    rowsToInsert: number;
    managedRowsToDelete: number;
    errors: number;
    warnings: number;
  };
  errors: BackfillIssue[];
  warnings: BackfillIssue[];
  products: BackfillProductPlan[];
};

type JsonRecord = Record<string, unknown>;

const COMMERCIAL_KEYS = PERFUME_ATTRIBUTE_FIELDS.map(
  (field) => field.key,
) as PerfumeCommercialKey[];

const PERFUME_ATTRIBUTE_NAMES = new Set(
  PERFUME_ATTRIBUTE_FIELDS.flatMap((field) =>
    getCatalogAttributeNameAliases(field.key).map(normalizeCatalogAttributeValue),
  ),
);

const NON_PERFUME_MANAGED_ATTRIBUTE_NAMES = new Set(
  MANAGED_CATALOG_ATTRIBUTE_KEYS.filter(
    (key) => !COMMERCIAL_KEYS.includes(key as PerfumeCommercialKey),
  ).map(normalizeCatalogAttributeValue),
);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedValuesEqual(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false;
  }

  const left = [...first].sort();
  const right = [...second].sort();
  return left.every((value, index) => value === right[index]);
}

function fieldConfig(key: PerfumeCommercialKey) {
  const field = PERFUME_ATTRIBUTE_FIELDS.find((candidate) => candidate.key === key);
  if (!field) {
    throw new Error(`No existe configuración central para ${key}.`);
  }
  return field;
}

function validateField(
  rawProduct: JsonRecord,
  key: PerfumeCommercialKey,
  entry: Pick<ValidatedBackfillEntry, "index" | "product_id" | "name">,
  errors: BackfillIssue[],
) {
  const config = fieldConfig(key);
  const rawValue = rawProduct[key];
  const sourceValues = config.multiple ? rawValue : [rawValue];

  if (!Array.isArray(sourceValues) || sourceValues.length === 0) {
    errors.push({
      code: "missing_attribute_value",
      message: `${key} debe contener al menos un valor.`,
      product_id: entry.product_id,
      name: entry.name,
      field: key,
      product_index: entry.index,
    });
    return [];
  }

  if (!config.multiple && Array.isArray(rawValue)) {
    errors.push({
      code: "invalid_single_value",
      message: `${key} debe ser un valor único, no una lista.`,
      product_id: entry.product_id,
      name: entry.name,
      field: key,
      product_index: entry.index,
    });
    return [];
  }

  const normalized: string[] = [];
  for (const value of sourceValues) {
    if (typeof value !== "string" || !value.trim()) {
      errors.push({
        code: "invalid_attribute_value",
        message: `${key} contiene un valor vacío o no textual.`,
        product_id: entry.product_id,
        name: entry.name,
        field: key,
        product_index: entry.index,
      });
      continue;
    }

    const normalizedValue = normalizeCatalogAttributeValue(value);
    if (!getAllowedValuesForField(config).has(normalizedValue)) {
      errors.push({
        code: "unsupported_attribute_value",
        message: `${key} contiene el valor no permitido "${value}".`,
        product_id: entry.product_id,
        name: entry.name,
        field: key,
        product_index: entry.index,
      });
      continue;
    }
    normalized.push(normalizedValue);
  }

  if (new Set(normalized).size !== normalized.length) {
    errors.push({
      code: "duplicate_attribute_value",
      message: `${key} contiene valores duplicados después de normalizar.`,
      product_id: entry.product_id,
      name: entry.name,
      field: key,
      product_index: entry.index,
    });
  }

  return [...new Set(normalized)];
}

export function validatePerfumeBackfillDocument(
  document: unknown,
): BackfillValidation {
  const errors: BackfillIssue[] = [];
  const warnings: BackfillIssue[] = [];

  if (!isRecord(document)) {
    return {
      schemaVersion: null,
      entries: [],
      errors: [{ code: "invalid_document", message: "El JSON debe ser un objeto." }],
      warnings,
    };
  }

  const schemaVersion =
    typeof document.schema_version === "number" ? document.schema_version : null;
  if (schemaVersion !== 1) {
    errors.push({
      code: "invalid_schema_version",
      message: "schema_version debe ser 1.",
    });
  }

  if (!Array.isArray(document.products)) {
    return {
      schemaVersion,
      entries: [],
      errors: [
        ...errors,
        { code: "invalid_products", message: "products debe ser una lista." },
      ],
      warnings,
    };
  }

  const entries = document.products.map((rawProduct, index) => {
    const product = isRecord(rawProduct) ? rawProduct : {};
    const productId =
      typeof product.product_id === "string" ? product.product_id.trim() : "";
    const name = typeof product.name === "string" ? product.name.trim() : "";
    const entry = { index, product_id: productId, name };
    const errorCountBefore = errors.length;

    if (!productId) {
      errors.push({
        code: "missing_product_id",
        message: "El registro no tiene product_id.",
        name,
        product_index: index,
      });
    }
    if (!name) {
      warnings.push({
        code: "missing_context_name",
        message: "El nombre contextual está vacío; se usará product_id.",
        product_id: productId || undefined,
        product_index: index,
      });
    }

    const attributes = Object.fromEntries(
      COMMERCIAL_KEYS.map((key) => [
        key,
        validateField(product, key, entry, errors),
      ]),
    ) as Record<PerfumeCommercialKey, string[]>;

    return {
      ...entry,
      target:
        errors.length === errorCountBefore && productId
          ? { product_id: productId, name, attributes }
          : null,
    };
  });

  const idCounts = new Map<string, number>();
  const nameGroups = new Map<string, ValidatedBackfillEntry[]>();
  for (const entry of entries) {
    if (entry.product_id) {
      idCounts.set(entry.product_id, (idCounts.get(entry.product_id) ?? 0) + 1);
    }
    const normalizedName = normalizeCatalogAttributeValue(entry.name);
    if (normalizedName) {
      nameGroups.set(normalizedName, [
        ...(nameGroups.get(normalizedName) ?? []),
        entry,
      ]);
    }
  }

  for (const entry of entries) {
    if ((idCounts.get(entry.product_id) ?? 0) > 1) {
      errors.push({
        code: "duplicate_product_id",
        message: `El product_id ${entry.product_id} aparece más de una vez.`,
        product_id: entry.product_id,
        name: entry.name,
        product_index: entry.index,
      });
      entry.target = null;
    }
  }

  for (const group of nameGroups.values()) {
    if (group.length > 1 && new Set(group.map((entry) => entry.product_id)).size > 1) {
      warnings.push({
        code: "duplicate_context_name",
        message: `El nombre "${group[0].name}" pertenece a IDs distintos y se conservarán separados.`,
        name: group[0].name,
      });
    }
  }

  return { schemaVersion, entries, errors, warnings };
}

export function planCommercialAttribute(
  key: PerfumeCommercialKey,
  desired: string[],
  currentAttributes: CurrentCommercialAttribute[],
): BackfillFieldPlan {
  const aliases = getCatalogAttributeNameAliases(key);
  const normalizedAliases = new Set(aliases.map(normalizeCatalogAttributeValue));
  const currentRows = currentAttributes.filter((attribute) =>
    normalizedAliases.has(normalizeCatalogAttributeValue(attribute.name)),
  );
  const normalizedCurrentRows = currentRows.map((attribute) =>
    normalizeCatalogAttributeValue(attribute.value),
  );
  const actual = [...new Set(normalizedCurrentRows)];
  const hasDuplicateRows = actual.length !== normalizedCurrentRows.length;
  const semanticallyEqual = normalizedValuesEqual(actual, desired);
  const action =
    currentRows.length === 0
      ? "create"
      : semanticallyEqual && !hasDuplicateRows
        ? "unchanged"
        : "replace";
  const simulatedOperations: BackfillFieldPlan["simulated_operations"] = [];

  if (action === "replace") {
    simulatedOperations.push({
      operation: "delete_managed_values",
      names: [...aliases],
    });
  }
  if (action !== "unchanged") {
    simulatedOperations.push({
      operation: "insert_values",
      name: key,
      values: desired,
    });
  }

  return {
    field: key,
    actual,
    desired,
    action,
    simulated_operations: simulatedOperations,
  };
}

export function buildPerfumeBackfillDryRun(
  validation: BackfillValidation,
  databaseProducts: BackfillDatabaseProduct[],
  perfumeCatalogIds: string[],
): PerfumeBackfillDryRun {
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const databaseById = new Map(databaseProducts.map((product) => [product.id, product]));
  const inputIds = new Set(
    validation.entries.map((entry) => entry.product_id).filter(Boolean),
  );

  for (const perfumeId of perfumeCatalogIds) {
    if (!inputIds.has(perfumeId)) {
      errors.push({
        code: "perfume_missing_from_file",
        message: `El perfume ${perfumeId} existe en Supabase pero falta en el archivo.`,
        product_id: perfumeId,
      });
    }
  }

  const products = validation.entries.map((entry): BackfillProductPlan => {
    const databaseProduct = databaseById.get(entry.product_id);
    if (!entry.target) {
      return {
        product_id: entry.product_id,
        source_name: entry.name,
        current_name: databaseProduct?.name ?? null,
        status: "invalid",
        attributes: [],
      };
    }
    if (!databaseProduct) {
      errors.push({
        code: "product_not_found",
        message: `No existe el product_id ${entry.product_id} en Supabase.`,
        product_id: entry.product_id,
        name: entry.name,
      });
      return {
        product_id: entry.product_id,
        source_name: entry.name,
        current_name: null,
        status: "missing",
        attributes: [],
      };
    }
    if (databaseProduct.category?.slug !== "perfumes") {
      errors.push({
        code: "wrong_category",
        message: `El producto ${entry.product_id} no pertenece a Perfumes.`,
        product_id: entry.product_id,
        name: entry.name,
      });
      return {
        product_id: entry.product_id,
        source_name: entry.name,
        current_name: databaseProduct.name,
        status: "wrong_category",
        attributes: [],
      };
    }
    const unexpectedManagedAttributes = databaseProduct.attributes.filter(
      (attribute) => {
        const normalizedName = normalizeCatalogAttributeValue(attribute.name);
        return (
          NON_PERFUME_MANAGED_ATTRIBUTE_NAMES.has(normalizedName) &&
          !PERFUME_ATTRIBUTE_NAMES.has(normalizedName)
        );
      },
    );
    if (unexpectedManagedAttributes.length > 0) {
      errors.push({
        code: "unexpected_managed_attribute",
        message: `El producto contiene atributos administrados no contemplados: ${[
          ...new Set(unexpectedManagedAttributes.map((attribute) => attribute.name)),
        ].join(", ")}.`,
        product_id: entry.product_id,
        name: entry.name,
      });
      return {
        product_id: entry.product_id,
        source_name: entry.name,
        current_name: databaseProduct.name,
        status: "invalid",
        attributes: [],
      };
    }
    if (
      entry.name &&
      normalizeCatalogAttributeValue(entry.name) !==
        normalizeCatalogAttributeValue(databaseProduct.name)
    ) {
      warnings.push({
        code: "context_name_mismatch",
        message: `El nombre del archivo difiere de Supabase; se mantiene el match por product_id.`,
        product_id: entry.product_id,
        name: entry.name,
      });
    }

    return {
      product_id: entry.product_id,
      source_name: entry.name,
      current_name: databaseProduct.name,
      status: "valid",
      attributes: COMMERCIAL_KEYS.map((key) =>
        planCommercialAttribute(
          key,
          entry.target!.attributes[key],
          databaseProduct.attributes,
        ),
      ),
    };
  });

  const fieldPlans = products.flatMap((product) => product.attributes);
  const validProducts = products.filter((product) => product.status === "valid").length;

  return {
    summary: {
      productsInFile: validation.entries.length,
      productsFoundInSupabase: validation.entries.filter((entry) =>
        databaseById.has(entry.product_id),
      ).length,
      validProducts,
      invalidProducts: validation.entries.length - validProducts,
      attributesToCreate: fieldPlans.filter((field) => field.action === "create").length,
      attributesToReplace: fieldPlans.filter((field) => field.action === "replace").length,
      attributesUnchanged: fieldPlans.filter((field) => field.action === "unchanged").length,
      rowsToInsert: fieldPlans
        .filter((field) => field.action !== "unchanged")
        .reduce((total, field) => total + field.desired.length, 0),
      managedRowsToDelete: fieldPlans
        .filter((field) => field.action === "replace")
        .reduce((total, field) => total + field.actual.length, 0),
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
    products,
  };
}

export function applySimulatedFieldPlans(
  currentAttributes: CurrentCommercialAttribute[],
  plans: BackfillFieldPlan[],
) {
  let result = [...currentAttributes];

  for (const plan of plans) {
    if (plan.action === "unchanged") {
      continue;
    }
    if (plan.action === "replace") {
      const aliases = new Set(
        getCatalogAttributeNameAliases(plan.field).map(normalizeCatalogAttributeValue),
      );
      result = result.filter(
        (attribute) => !aliases.has(normalizeCatalogAttributeValue(attribute.name)),
      );
    }
    result.push(
      ...plan.desired.map((value) => ({ name: plan.field, value })),
    );
  }

  return result;
}
