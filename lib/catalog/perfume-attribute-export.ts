import {
  PERFUME_ATTRIBUTE_FIELDS,
  getCatalogAttributeNameAliases,
  getCatalogAttributeValues,
  normalizeCatalogAttributeValue,
  type CatalogAttribute,
} from "./attribute-config.ts";

export type PerfumeExportSource = {
  id: string;
  name: string | null;
  slug: string;
  sku: string | null;
  price: number | string | null;
  transfer_price: number | string | null;
  stock: number;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  attributes: CatalogAttribute[] | null;
};

export type PerfumeExportRecord = {
  product_id: string;
  name: string;
  slug: string;
  sku: string;
  category: string;
  price: number | null;
  transfer_price: number | null;
  stock: number;
  brand: string;
  type: string;
  supplier: string;
  commercial_category: string;
  olfactory_family: string[];
  intensity: string;
  occasion: string[];
  gender: string;
  legacy_attributes: Record<string, string[]>;
};

export type PerfumeExportWarning = {
  code:
    | "duplicate_product_id"
    | "duplicate_name"
    | "missing_name"
    | "missing_brand"
    | "missing_type"
    | "unexpected_legacy_attribute"
    | "existing_commercial_attribute";
  product_id: string;
  name: string;
  detail: string;
};

export type PerfumeExportResult = {
  records: PerfumeExportRecord[];
  warnings: PerfumeExportWarning[];
  summary: {
    total: number;
    withBrand: number;
    withoutBrand: number;
    withType: number;
    withoutType: number;
    withCommercialAttributes: number;
    withoutCommercialAttributes: number;
    warningCount: number;
  };
};

const LEGACY_FIELDS = {
  brand: "Marca",
  type: "Tipo",
  supplier: "Proveedor",
} as const;

const BASE_CSV_COLUMNS = [
  "product_id",
  "name",
  "slug",
  "sku",
  "category",
  "price",
  "transfer_price",
  "stock",
  "brand",
  "type",
  "supplier",
  "commercial_category",
  "olfactory_family",
  "intensity",
  "occasion",
  "gender",
] as const;

function valuesForName(attributes: CatalogAttribute[], name: string) {
  const normalizedName = normalizeCatalogAttributeValue(name);
  return [
    ...new Set(
      attributes
        .filter(
          (attribute) =>
            normalizeCatalogAttributeValue(attribute.name) === normalizedName,
        )
        .map((attribute) => attribute.value.trim())
        .filter(Boolean),
    ),
  ];
}

function toNullableNumber(value: number | string | null) {
  if (value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLegacyColumnName(name: string) {
  return `legacy_${normalizeCatalogAttributeValue(name).replace(/-/g, "_")}`;
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildPerfumeAttributeExport(
  products: PerfumeExportSource[],
): PerfumeExportResult {
  const warnings: PerfumeExportWarning[] = [];
  const idCounts = new Map<string, number>();
  const nameCounts = new Map<string, number>();
  const commercialNames = new Set(
    PERFUME_ATTRIBUTE_FIELDS.flatMap((field) =>
      getCatalogAttributeNameAliases(field.key).map(normalizeCatalogAttributeValue),
    ),
  );
  const expectedLegacyNames = new Set(
    Object.values(LEGACY_FIELDS).map(normalizeCatalogAttributeValue),
  );

  for (const product of products) {
    idCounts.set(product.id, (idCounts.get(product.id) ?? 0) + 1);
    const normalizedName = normalizeCatalogAttributeValue(product.name ?? "");
    if (normalizedName) {
      nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1);
    }
  }

  const records = products.map((product) => {
    const name = product.name?.trim() ?? "";
    const attributes = product.attributes ?? [];
    const brand = valuesForName(attributes, LEGACY_FIELDS.brand).join("|");
    const type = valuesForName(attributes, LEGACY_FIELDS.type).join("|");
    const supplier = valuesForName(attributes, LEGACY_FIELDS.supplier).join("|");
    const commercialValues = Object.fromEntries(
      PERFUME_ATTRIBUTE_FIELDS.map((field) => [
        field.key,
        getCatalogAttributeValues(attributes, field.key),
      ]),
    );
    const hasCommercialAttributes = Object.values(commercialValues).some(
      (values) => values.length > 0,
    );
    const legacyAttributes: Record<string, string[]> = {};

    for (const attribute of attributes) {
      const normalizedAttributeName = normalizeCatalogAttributeValue(attribute.name);
      if (
        commercialNames.has(normalizedAttributeName) ||
        expectedLegacyNames.has(normalizedAttributeName)
      ) {
        continue;
      }

      const existing = legacyAttributes[attribute.name] ?? [];
      const value = attribute.value.trim();
      if (value && !existing.includes(value)) {
        legacyAttributes[attribute.name] = [...existing, value];
      }
    }

    const addWarning = (warning: Omit<PerfumeExportWarning, "product_id" | "name">) => {
      warnings.push({ ...warning, product_id: product.id, name });
    };

    if ((idCounts.get(product.id) ?? 0) > 1) {
      addWarning({
        code: "duplicate_product_id",
        detail: `El product_id ${product.id} aparece más de una vez.`,
      });
    }
    if (!name) {
      addWarning({ code: "missing_name", detail: "El producto no tiene nombre." });
    } else if ((nameCounts.get(normalizeCatalogAttributeValue(name)) ?? 0) > 1) {
      addWarning({
        code: "duplicate_name",
        detail: `El nombre normalizado \"${name}\" aparece más de una vez.`,
      });
    }
    if (!brand) {
      addWarning({ code: "missing_brand", detail: "El perfume no tiene Marca." });
    }
    if (!type) {
      addWarning({ code: "missing_type", detail: "El perfume no tiene Tipo." });
    }
    for (const attributeName of Object.keys(legacyAttributes)) {
      addWarning({
        code: "unexpected_legacy_attribute",
        detail: `Atributo legacy no esperado: ${attributeName}.`,
      });
    }
    if (hasCommercialAttributes) {
      addWarning({
        code: "existing_commercial_attribute",
        detail: "El perfume ya contiene al menos un atributo comercial nuevo.",
      });
    }

    return {
      product_id: product.id,
      name,
      slug: product.slug,
      sku: product.sku ?? "",
      category: product.category.name,
      price: toNullableNumber(product.price),
      transfer_price: toNullableNumber(product.transfer_price),
      stock: product.stock,
      brand,
      type,
      supplier,
      commercial_category: commercialValues.commercial_category?.[0] ?? "",
      olfactory_family: commercialValues.olfactory_family ?? [],
      intensity: commercialValues.intensity?.[0] ?? "",
      occasion: commercialValues.occasion ?? [],
      gender: commercialValues.gender?.[0] ?? "",
      legacy_attributes: legacyAttributes,
    } satisfies PerfumeExportRecord;
  });

  records.sort((first, second) =>
    first.name.localeCompare(second.name, "es", { sensitivity: "base" }),
  );

  const withBrand = records.filter((record) => Boolean(record.brand)).length;
  const withType = records.filter((record) => Boolean(record.type)).length;
  const withCommercialAttributes = records.filter(
    (record) =>
      Boolean(record.commercial_category) ||
      record.olfactory_family.length > 0 ||
      Boolean(record.intensity) ||
      record.occasion.length > 0 ||
      Boolean(record.gender),
  ).length;

  return {
    records,
    warnings,
    summary: {
      total: records.length,
      withBrand,
      withoutBrand: records.length - withBrand,
      withType,
      withoutType: records.length - withType,
      withCommercialAttributes,
      withoutCommercialAttributes: records.length - withCommercialAttributes,
      warningCount: warnings.length,
    },
  };
}

export function serializePerfumeAttributeCsv(records: PerfumeExportRecord[]) {
  const legacyColumns = [
    ...new Set(
      records.flatMap((record) =>
        Object.keys(record.legacy_attributes).map(normalizeLegacyColumnName),
      ),
    ),
  ].sort();
  const columns = [...BASE_CSV_COLUMNS, ...legacyColumns];
  const rows = records.map((record) => {
    const legacyValues = Object.fromEntries(
      Object.entries(record.legacy_attributes).map(([name, values]) => [
        normalizeLegacyColumnName(name),
        values.join("|"),
      ]),
    );
    const values: Record<string, string | number | null> = {
      product_id: record.product_id,
      name: record.name,
      slug: record.slug,
      sku: record.sku,
      category: record.category,
      price: record.price,
      transfer_price: record.transfer_price,
      stock: record.stock,
      brand: record.brand,
      type: record.type,
      supplier: record.supplier,
      commercial_category: record.commercial_category,
      olfactory_family: record.olfactory_family.join("|"),
      intensity: record.intensity,
      occasion: record.occasion.join("|"),
      gender: record.gender,
      ...legacyValues,
    };

    return columns.map((column) => csvCell(values[column] ?? "")).join(",");
  });

  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

export function serializePerfumeAttributeJson(records: PerfumeExportRecord[]) {
  return `${JSON.stringify({ schema_version: 1, products: records }, null, 2)}\n`;
}
