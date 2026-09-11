export type CatalogAttribute = {
  name: string;
  value: string;
};

export type CatalogAttributeOption = {
  label: string;
  value: string;
};

export type CatalogAttributeField = {
  key: CatalogAttributeKey;
  label: string;
  multiple: boolean;
  input: "checkboxes" | "select" | "boolean";
  options: readonly CatalogAttributeOption[];
};

export const CATALOG_ATTRIBUTE_KEYS = {
  commercialCategory: "commercial_category",
  olfactoryFamily: "olfactory_family",
  intensity: "intensity",
  occasion: "occasion",
  gender: "gender",
  // Legacy parser token only. Decants are standalone products and this key is not a managed field.
  decantAvailable: "decant_available",
  mateType: "mate_type",
  material: "material",
  color: "color",
  useCase: "use_case",
} as const;

export type CatalogAttributeKey =
  (typeof CATALOG_ATTRIBUTE_KEYS)[keyof typeof CATALOG_ATTRIBUTE_KEYS];

const option = (value: string, label: string): CatalogAttributeOption => ({
  value,
  label,
});

export const PERFUME_COMMERCIAL_CATEGORY_OPTIONS = [
  option("arabe", "Árabe"),
  option("disenador", "Diseñador"),
  option("nicho", "Nicho"),
  option("inspirado", "Inspirado"),
  option("otro", "Otro"),
] as const;

export const PERFUME_OLFACTORY_FAMILY_OPTIONS = [
  option("dulce", "Dulce"),
  option("fresco", "Fresco"),
  option("frutal", "Frutal"),
  option("citrico", "Cítrico"),
  option("amaderado", "Amaderado"),
  option("especiado", "Especiado"),
  option("ambarado", "Ambarado"),
  option("floral", "Floral"),
  option("aromatico", "Aromático"),
  option("acuatico", "Acuático"),
  option("gourmand", "Gourmand"),
  option("cuero", "Cuero"),
] as const;

export const PERFUME_INTENSITY_OPTIONS = [
  option("suave", "Suave"),
  option("media", "Media"),
  option("intensa", "Intensa"),
] as const;

export const PERFUME_OCCASION_OPTIONS = [
  option("diario", "Diario"),
  option("trabajo", "Trabajo"),
  option("salida", "Salida"),
  option("cita", "Cita"),
  option("noche", "Noche"),
  option("evento", "Evento"),
  option("regalo", "Regalo"),
] as const;

export const PERFUME_GENDER_OPTIONS = [
  option("masculino", "Masculino"),
  option("femenino", "Femenino"),
  option("unisex", "Unisex"),
] as const;

export const MATE_TYPE_OPTIONS = [
  option("imperial", "Imperial"),
  option("camionero", "Camionero"),
  option("torpedo", "Torpedo"),
  option("criollo", "Criollo"),
  option("algarrobo", "Algarrobo"),
] as const;

export const MATE_MATERIAL_OPTIONS = [
  option("cuero", "Cuero"),
  option("calabaza", "Calabaza"),
  option("algarrobo", "Algarrobo"),
  option("acero", "Acero"),
  option("alpaca", "Alpaca"),
] as const;

export const MATE_COLOR_OPTIONS = [
  option("negro", "Negro"),
  option("borravino", "Borravino"),
  option("suela", "Suela"),
  option("marron", "Marrón"),
  option("animal-print", "Animal print"),
  option("natural", "Natural"),
] as const;

export const MATE_USE_CASE_OPTIONS = [
  option("uso-diario", "Uso diario"),
  option("para-regalar", "Para regalar"),
  option("premium", "Premium"),
] as const;

export const PERFUME_ATTRIBUTE_FIELDS: readonly CatalogAttributeField[] = [
  {
    key: CATALOG_ATTRIBUTE_KEYS.commercialCategory,
    label: "Categoría comercial",
    multiple: false,
    input: "select",
    options: PERFUME_COMMERCIAL_CATEGORY_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.olfactoryFamily,
    label: "Familia / estilo olfativo",
    multiple: true,
    input: "checkboxes",
    options: PERFUME_OLFACTORY_FAMILY_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.intensity,
    label: "Intensidad",
    multiple: false,
    input: "select",
    options: PERFUME_INTENSITY_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.occasion,
    label: "Ocasión",
    multiple: true,
    input: "checkboxes",
    options: PERFUME_OCCASION_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.gender,
    label: "Género",
    multiple: false,
    input: "select",
    options: PERFUME_GENDER_OPTIONS,
  },
];

export const MATE_ATTRIBUTE_FIELDS: readonly CatalogAttributeField[] = [
  {
    key: CATALOG_ATTRIBUTE_KEYS.mateType,
    label: "Tipo de mate",
    multiple: false,
    input: "select",
    options: MATE_TYPE_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.material,
    label: "Material",
    multiple: true,
    input: "checkboxes",
    options: MATE_MATERIAL_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.color,
    label: "Color",
    multiple: false,
    input: "select",
    options: MATE_COLOR_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.useCase,
    label: "Uso",
    multiple: true,
    input: "checkboxes",
    options: MATE_USE_CASE_OPTIONS,
  },
];

export const MANAGED_CATALOG_ATTRIBUTE_KEYS = [
  ...PERFUME_ATTRIBUTE_FIELDS.map((field) => field.key),
  ...MATE_ATTRIBUTE_FIELDS.map((field) => field.key),
] as const;

export const LEGACY_COMMERCIAL_CATEGORY_NAME = "Categoría comercial";

const ATTRIBUTE_NAME_ALIASES: Record<CatalogAttributeKey, readonly string[]> = {
  [CATALOG_ATTRIBUTE_KEYS.commercialCategory]: [
    CATALOG_ATTRIBUTE_KEYS.commercialCategory,
    LEGACY_COMMERCIAL_CATEGORY_NAME,
  ],
  [CATALOG_ATTRIBUTE_KEYS.olfactoryFamily]: [
    CATALOG_ATTRIBUTE_KEYS.olfactoryFamily,
    "Familia olfativa",
    "Familia / estilo olfativo",
  ],
  [CATALOG_ATTRIBUTE_KEYS.intensity]: [
    CATALOG_ATTRIBUTE_KEYS.intensity,
    "Intensidad",
  ],
  [CATALOG_ATTRIBUTE_KEYS.occasion]: [
    CATALOG_ATTRIBUTE_KEYS.occasion,
    "Ocasión",
    "Momento",
    "Momento de uso",
  ],
  [CATALOG_ATTRIBUTE_KEYS.gender]: [
    CATALOG_ATTRIBUTE_KEYS.gender,
    "Género",
    "Genero",
  ],
  [CATALOG_ATTRIBUTE_KEYS.decantAvailable]: [
    CATALOG_ATTRIBUTE_KEYS.decantAvailable,
  ],
  [CATALOG_ATTRIBUTE_KEYS.mateType]: [
    CATALOG_ATTRIBUTE_KEYS.mateType,
    "Tipo de mate",
  ],
  [CATALOG_ATTRIBUTE_KEYS.material]: [
    CATALOG_ATTRIBUTE_KEYS.material,
    "Material",
  ],
  [CATALOG_ATTRIBUTE_KEYS.color]: [CATALOG_ATTRIBUTE_KEYS.color, "Color"],
  [CATALOG_ATTRIBUTE_KEYS.useCase]: [
    CATALOG_ATTRIBUTE_KEYS.useCase,
    "Uso",
  ],
};

const legacyCommercialCategoryValues = new Map(
  PERFUME_COMMERCIAL_CATEGORY_OPTIONS.map((item) => [
    normalizeCatalogAttributeValue(item.label),
    item.value,
  ]),
);

export function getCatalogAttributeInputName(key: CatalogAttributeKey) {
  return `catalog_attribute_${key}`;
}

export function normalizeCatalogAttributeValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCatalogAttributeNameAliases(key: CatalogAttributeKey) {
  return ATTRIBUTE_NAME_ALIASES[key];
}

export function getCatalogAttributeValues(
  attributes: CatalogAttribute[] | null | undefined,
  key: CatalogAttributeKey,
) {
  const acceptedNames = new Set(
    getCatalogAttributeNameAliases(key).map(normalizeCatalogAttributeValue),
  );
  const values = (attributes ?? [])
    .filter((attribute) =>
      acceptedNames.has(normalizeCatalogAttributeValue(attribute.name)),
    )
    .map((attribute) => normalizeCatalogAttributeValue(attribute.value))
    .map((value) =>
      key === CATALOG_ATTRIBUTE_KEYS.commercialCategory
        ? legacyCommercialCategoryValues.get(value) ?? value
        : value,
    );

  return [...new Set(values)];
}

export function getCatalogAttributeField(key: CatalogAttributeKey) {
  return [...PERFUME_ATTRIBUTE_FIELDS, ...MATE_ATTRIBUTE_FIELDS].find(
    (field) => field.key === key,
  );
}

export function getCatalogAttributeOptionLabel(
  key: CatalogAttributeKey,
  value: string,
) {
  const normalizedValue = normalizeCatalogAttributeValue(value);
  return (
    getCatalogAttributeField(key)?.options.find(
      (option) => option.value === normalizedValue,
    )?.label ?? value
  );
}

export function productHasCatalogAttribute(
  attributes: CatalogAttribute[] | null | undefined,
  key: CatalogAttributeKey,
  value: string,
) {
  return getCatalogAttributeValues(attributes, key).includes(
    normalizeCatalogAttributeValue(value),
  );
}

export function getAttributeFieldsForCategory(categorySlug: string) {
  if (categorySlug === "perfumes") {
    return PERFUME_ATTRIBUTE_FIELDS;
  }

  if (categorySlug === "mates") {
    return MATE_ATTRIBUTE_FIELDS;
  }

  return [];
}

export function getAllowedValuesForField(field: CatalogAttributeField) {
  return new Set(field.options.map((item) => item.value));
}
