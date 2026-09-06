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
  option("presencia", "Para hacer sentir presencia"),
  option("diario", "Para usar todos los días"),
  option("frescos", "Frescos y versátiles"),
  option("dulces", "Dulces y llamativos"),
  option("nocturnos", "Elegantes y nocturnos"),
  option("diferentes", "Para salir de lo habitual"),
  option("regalo", "Para regalar bien"),
  option("decants", "Decants para probar"),
] as const;

export const PERFUME_OLFACTORY_FAMILY_OPTIONS = [
  option("fresco", "Fresco"),
  option("citrico", "Cítrico"),
  option("acuatico", "Acuático"),
  option("aromatico", "Aromático"),
  option("verde", "Verde"),
  option("frutal", "Frutal"),
  option("dulce", "Dulce"),
  option("vainilla", "Vainilla"),
  option("gourmand", "Gourmand"),
  option("ambar", "Ámbar"),
  option("amaderado", "Amaderado"),
  option("especiado", "Especiado"),
  option("oud", "Oud"),
  option("oriental", "Oriental"),
] as const;

export const PERFUME_INTENSITY_OPTIONS = [
  option("suave", "Suave"),
  option("media", "Media"),
  option("alta", "Alta"),
  option("muy-alta", "Muy alta"),
] as const;

export const PERFUME_OCCASION_OPTIONS = [
  option("dia", "Día"),
  option("noche", "Noche"),
  option("trabajo", "Trabajo"),
  option("facultad", "Facultad"),
  option("uso-diario", "Uso diario"),
  option("salida", "Salida"),
  option("cita", "Cita"),
  option("evento", "Evento"),
  option("verano", "Verano"),
  option("invierno", "Invierno"),
  option("regalo", "Regalo"),
] as const;

export const PERFUME_GENDER_OPTIONS = [
  option("hombre", "Hombre"),
  option("mujer", "Mujer"),
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
    multiple: true,
    input: "checkboxes",
    options: PERFUME_COMMERCIAL_CATEGORY_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.olfactoryFamily,
    label: "Familia olfativa",
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
    label: "Momento de uso",
    multiple: true,
    input: "checkboxes",
    options: PERFUME_OCCASION_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.gender,
    label: "Género / orientación comercial",
    multiple: false,
    input: "select",
    options: PERFUME_GENDER_OPTIONS,
  },
  {
    key: CATALOG_ATTRIBUTE_KEYS.decantAvailable,
    label: "Disponible como decant",
    multiple: false,
    input: "boolean",
    options: [],
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

export function getCatalogAttributeValues(
  attributes: CatalogAttribute[] | null | undefined,
  key: CatalogAttributeKey,
) {
  const values = (attributes ?? [])
    .filter(
      (attribute) =>
        attribute.name === key ||
        (key === CATALOG_ATTRIBUTE_KEYS.commercialCategory &&
          attribute.name === LEGACY_COMMERCIAL_CATEGORY_NAME),
    )
    .map((attribute) => normalizeCatalogAttributeValue(attribute.value))
    .map((value) =>
      key === CATALOG_ATTRIBUTE_KEYS.commercialCategory
        ? legacyCommercialCategoryValues.get(value) ?? value
        : value,
    );

  return [...new Set(values)];
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
