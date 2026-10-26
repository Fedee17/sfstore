import {
  CATALOG_ATTRIBUTE_KEYS,
  getCatalogAttributeField,
  getCatalogAttributeOptionLabel,
  getCatalogAttributeValues,
  type CatalogAttribute,
  type CatalogAttributeKey,
} from "@/lib/catalog/attribute-config";

type InformationInput = {
  category: string;
  shortDescription?: string | null;
  description?: string | null;
  attributes?: CatalogAttribute[] | null;
};

/** Presentation of existing catalog data only; no inferred notes, units or performance. */
export function getProductCommercialInformation(product: InformationInput) {
  const attributes = product.attributes ?? [];
  const fields: { label: string; values: string[] }[] = [];
  const addRegistered = (label: string, names: string[]) => {
    const accepted = new Set(names.map(name => name.toLocaleLowerCase("es-AR")));
    const values = [...new Set(attributes
      .filter(a => accepted.has(a.name.trim().toLocaleLowerCase("es-AR")))
      .map(a => a.value.trim()).filter(Boolean))];
    if (values.length) fields.push({ label, values });
  };
  const addManaged = (label: string, key: CatalogAttributeKey) => {
    const allowed = new Set(getCatalogAttributeField(key)?.options.map(option => option.value));
    const values = getCatalogAttributeValues(attributes, key)
      .filter(value => allowed.has(value))
      .map(value => getCatalogAttributeOptionLabel(key, value));
    if (values.length) fields.push({ label, values });
  };

  addRegistered("Marca", ["Marca"]);
  if (product.category === "perfumes") {
    addManaged("Perfil olfativo", CATALOG_ATTRIBUTE_KEYS.olfactoryFamily);
    addManaged("Intensidad orientativa", CATALOG_ATTRIBUTE_KEYS.intensity);
    addManaged("Ocasiones sugeridas", CATALOG_ATTRIBUTE_KEYS.occasion);
    addRegistered("Contenido", ["Contenido", "Volumen", "Capacidad"]);
  } else if (product.category === "mates") {
    addManaged("Tipo de mate", CATALOG_ATTRIBUTE_KEYS.mateType);
    addManaged("Material", CATALOG_ATTRIBUTE_KEYS.material);
    addRegistered("Capacidad", ["Capacidad", "Volumen"]);
  }

  const shortDescription = product.shortDescription?.trim() ?? "";
  const description = product.description?.trim() ?? "";
  const comparable = (text: string) => text.replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
  return {
    shortDescription,
    description: comparable(description) === comparable(shortDescription) ? "" : description,
    fields,
  };
}
