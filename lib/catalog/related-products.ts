import type { Product } from "../../types/product.ts";
import { publicationAvailable } from "../products/public-families.ts";
import { availableFirst } from "./availability-order.ts";
import { CATALOG_ATTRIBUTE_KEYS, getCatalogAttributeValues } from "./attribute-config.ts";
import { isDecantProduct, recommendPerfumes } from "./perfume-recommendation.ts";
import { MATERO_KIND_ORDER, materoKind, materoKindSubcategories, type MateroKind } from "./matero-taxonomy.ts";

type RelatedCandidate = Product & { categorySlug?: string };

const RELATED_LIMIT = 4;

// In the real catalog porta mates, dispenser and despolvillador sit in the public «Accesorios» section under the
// generic «accesorios» subcategory; electronics and gift boxes there are not matero complements.
const MATERO_ACCESSORY_SUBCATEGORY = "accesorios";
const isMateroAccessory = (product: RelatedCandidate) => product.category === "accesorios" && product.categorySlug === MATERO_ACCESSORY_SUBCATEGORY;
// Subcategories of each cross-sell kind, in preference order; the generic accessories close the «otros» kind.
const kindSubcategories = (kind: MateroKind) => [...materoKindSubcategories(kind), ...(kind === "otros" ? [MATERO_ACCESSORY_SUBCATEGORY] : [])];

const gender = (product: RelatedCandidate) => getCatalogAttributeValues(product.attributes, CATALOG_ATTRIBUTE_KEYS.gender)[0];
const opposite: Record<string, string> = { masculino: "femenino", femenino: "masculino" };
const isDecant = ({ id, name, slug, attributes }: RelatedCandidate) => isDecantProduct({ id, name, slug, attributes });

/** Perfumes ranked by olfactory family and intensity with the existing recommender; gender is a filter, never crossed. */
function perfumeCandidates(current: RelatedCandidate, candidates: RelatedCandidate[]) {
  const currentGender = gender(current);
  const decant = isDecant(current);
  const compatible = candidates.filter(product => isDecant(product) === decant
    && !(currentGender && gender(product) === opposite[currentGender]));
  const olfactoryFamilies = getCatalogAttributeValues(current.attributes, CATALOG_ATTRIBUTE_KEYS.olfactoryFamily);
  const intensity = getCatalogAttributeValues(current.attributes, CATALOG_ATTRIBUTE_KEYS.intensity)[0];
  if (!olfactoryFamilies.length && !intensity) return { ranked: [], rest: compatible };
  const ranked = recommendPerfumes(
    compatible.map(product => ({ id: product.id, name: product.name, slug: product.slug, stock: Number(publicationAvailable(product)), attributes: product.attributes, category: { slug: "perfumes" }, product })),
    { gender: currentGender, olfactoryFamilies, intensity },
  ).map(recommendation => recommendation.product.product);
  return { ranked, rest: compatible.filter(product => !ranked.includes(product)) };
}

/** Mates and termos: one product per complementary kind in turn, then more of the same kind. */
function materoCandidates(current: RelatedCandidate, candidates: RelatedCandidate[]) {
  const own = materoKind(current.categorySlug);
  const groups = MATERO_KIND_ORDER.filter(kind => kind !== own)
    .map(kind => kindSubcategories(kind).flatMap(slug => availableFirst(candidates.filter(product => product.categorySlug === slug))));
  const ranked: RelatedCandidate[] = [];
  for (let round = 0; groups.some(group => group.length > round); round++)
    for (const group of groups) if (group[round]) ranked.push(group[round]);
  return { ranked, rest: candidates.filter(product => !ranked.includes(product)) };
}

/**
 * CONV-01: suggestions for «Más en…» on a product page. Same public section, never the product on screen or its family,
 * only with a photo; available products first and sold-out ones only to fill the gap.
 */
export function selectRelatedProducts<T extends RelatedCandidate>(current: T, catalog: readonly T[], limit = RELATED_LIMIT): T[] {
  const family = current.familyId ?? (current.kind === "family" ? current.id : undefined);
  const candidates = catalog.filter(product => (product.category === current.category || (current.category === "mates" && isMateroAccessory(product)))
    && product.id !== current.id
    && !(family && (product.familyId === family || product.id === family)) && Boolean(product.primaryImageUrl?.trim()));
  const { ranked, rest } = current.category === "perfumes" ? perfumeCandidates(current, candidates)
    : current.category === "mates" ? materoCandidates(current, candidates)
    : { ranked: [], rest: candidates };
  const ordered = [...ranked, ...availableFirst(rest)] as T[];
  return [...ordered.filter(publicationAvailable), ...ordered.filter(product => !publicationAvailable(product))].slice(0, limit);
}
