import {
  CATALOG_ATTRIBUTE_KEYS,
  getCatalogAttributeField,
  getCatalogAttributeNameAliases,
  getCatalogAttributeOptionLabel,
  getCatalogAttributeValues,
  type CatalogAttribute,
  type CatalogAttributeKey,
} from "@/lib/catalog/attribute-config";

import { getPerfumeAccords } from "./perfume-accords";
import perfumeBrands from "./perfume-brand-research.json";
import perfumeNotes from "./perfume-notes-research.json";

const noteFields = [
  ["Notas", ["Notas"], "general"],
  ["Notas de salida", ["Notas de salida"], "top"],
  ["Notas de corazón", ["Notas de corazón", "Notas de corazon"], "heart"],
  ["Notas de fondo", ["Notas de fondo"], "base"],
] as const;

const researchedNotes: Readonly<Record<string, {
  sourceUrl: string;
  summary?: string;
  notes: Partial<Record<(typeof noteFields)[number][2], string[]>>;
}>> = perfumeNotes;

type InformationInput = {
  category: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  attributes?: CatalogAttribute[] | null;
};

const eclaireEditorial = {
  brand: "Lattafa",
  summary: "Un perfume dulce y cremoso. Abre con caramelo y leche, y deja un aroma de vainilla y praliné.",
  description: "Si te gustan los perfumes que recuerdan a un postre, elegilo para una salida de noche. Éclaire combina una salida de caramelo, leche y azúcar con un corazón de flores blancas y miel. Al asentarse, aparecen la vainilla, el praliné y el almizcle.",
  notes: [
    { label: "Notas de salida", values: ["Caramelo", "Leche", "Azúcar"] },
    { label: "Notas de corazón", values: ["Flores blancas", "Miel"] },
    { label: "Notas de fondo", values: ["Vainilla", "Praliné", "Almizcle"] },
  ],
  notesSource: "https://www.lattafa-usa.com/products/eclaire",
  communityReviewsUrl: "https://www.fragrantica.com/perfume/Lattafa-Perfumes/Eclaire-93628.html",
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

function registeredNotesSource(attributes: readonly CatalogAttribute[]) {
  const value = attributes.find(item => comparable(item.name) === "fuente de notas")?.value;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { return undefined; }
}

export function getProductCommercialInformation(product: InformationInput) {
  const editorial = product.category === "perfumes" && product.slug === "lattafa-eclaire" ? eclaireEditorial : undefined;
  const attributes = product.attributes ?? [];
  const fields: { label: string; values: string[] }[] = [];
  const addRegistered = (label: string, names: readonly string[]) => {
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
  if (product.category === "perfumes" && !fields.length) {
    const slug = product.slug;
    const reference = slug && Object.hasOwn(perfumeBrands, slug)
      ? perfumeBrands[slug as keyof typeof perfumeBrands]
      : undefined;
    const brand = editorial?.brand ?? reference?.brand;
    if (brand) fields.push({ label: "Marca", values: [brand] });
  }
  let notesSource: string | undefined;
  let researchedSummary: string | undefined;
  if (product.category === "perfumes") {
    addManaged("Perfil olfativo", CATALOG_ATTRIBUTE_KEYS.olfactoryFamily);
    addManaged("Intensidad orientativa", CATALOG_ATTRIBUTE_KEYS.intensity);
    addManaged("Ocasiones sugeridas", CATALOG_ATTRIBUTE_KEYS.occasion);
    // Managed volume first; a registered value outside the managed list is still shown as written.
    const volumeFields = fields.length;
    addManaged("Contenido", CATALOG_ATTRIBUTE_KEYS.volume);
    if (fields.length === volumeFields) addRegistered("Contenido", getCatalogAttributeNameAliases(CATALOG_ATTRIBUTE_KEYS.volume));
    addRegistered("Presentación", ["Presentación", "Presentacion", "Concentración", "Concentracion"]);
    if (editorial) {
      fields.push(...editorial.notes);
      notesSource = editorial.notesSource;
    } else {
      const initialFieldCount = fields.length;
      for (const [label, aliases] of noteFields) addRegistered(label, aliases);
      const reference = product.slug && Object.hasOwn(researchedNotes, product.slug)
        ? researchedNotes[product.slug] : undefined;
      if (reference && fields.length === initialFieldCount) {
        for (const [label, , stage] of noteFields) {
          const values = reference.notes[stage];
          if (values?.length) fields.push({ label, values });
        }
        notesSource = reference.sourceUrl;
        researchedSummary = reference.summary;
      } else if (fields.length > initialFieldCount) {
        notesSource = registeredNotesSource(attributes);
      }
    }
  } else if (product.category === "mates") {
    addManaged("Tipo de mate", CATALOG_ATTRIBUTE_KEYS.mateType);
    addManaged("Material", CATALOG_ATTRIBUTE_KEYS.material);
    addRegistered("Capacidad", ["Capacidad", "Volumen"]);
  }

  const shortDescription = commercialText(editorial?.summary ?? researchedSummary ?? product.shortDescription);
  const description = commercialText(editorial?.description ?? product.description, shortDescription);
  return {
    shortDescription,
    description: comparable(description) === comparable(shortDescription) ? "" : description,
    fields,
    notesSource,
    communityReviewsUrl: editorial?.communityReviewsUrl,
    accords: product.category === "perfumes" ? getPerfumeAccords(product.slug, attributes) : undefined,
  };
}
