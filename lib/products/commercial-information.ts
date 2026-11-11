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

const templateSentence = /disponible en sfstore|forma parte del cat[aá]logo|te ayudamos a elegir|si ten[eé]s dudas, te acompa[nñ]amos para elegir|es una opci[oó]n ideal para quienes buscan un aroma con presencia, pensado para uso diario, salida o regalo|combina estilo, presencia y una sensaci[oó]n de calidad desde el primer uso|es una alternativa ideal si busc[aá]s un perfume para regalar bien, probar algo distinto o sumar a tu rutina un aroma que acompa[nñ]e tu estilo/i;
const comparable = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("es-AR");

function commercialText(text: string | null | undefined, summary = "") {
  const summarySentences = new Set(summary.split(/(?<=[.!?])\s+/).map(comparable));
  return (text ?? "").trim().split(/\n\s*\n/).map(paragraph => paragraph
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !templateSentence.test(sentence) && !summarySentences.has(comparable(sentence)))
    .join(" ").trim()).filter(Boolean).join("\n\n");
}

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
    addRegistered("Presentación", ["Presentación", "Presentacion", "Concentración", "Concentracion"]);
    addRegistered("Notas", ["Notas"]);
    addRegistered("Notas de salida", ["Notas de salida"]);
    addRegistered("Notas de corazón", ["Notas de corazón", "Notas de corazon"]);
    addRegistered("Notas de fondo", ["Notas de fondo"]);
  } else if (product.category === "mates") {
    addManaged("Tipo de mate", CATALOG_ATTRIBUTE_KEYS.mateType);
    addManaged("Material", CATALOG_ATTRIBUTE_KEYS.material);
    addRegistered("Capacidad", ["Capacidad", "Volumen"]);
  }

  const shortDescription = commercialText(product.shortDescription);
  const description = commercialText(product.description, shortDescription);
  return {
    shortDescription,
    description: comparable(description) === comparable(shortDescription) ? "" : description,
    fields,
  };
}
