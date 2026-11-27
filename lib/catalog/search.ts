type SearchableProduct = {
  name: string;
  shortDescription: string;
  categoryName?: string;
  categorySlug?: string;
  variants?: {name:string;variantLabel?:string}[];
  attributes?: { name: string; value: string }[];
};

type SearchTerm = { word: string; term: string; singular: string };

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-AR").trim();
}

function searchTerms(query: string): SearchTerm[] {
  return normalizeSearch(query).split(/\s+/).filter(Boolean).map((word) => {
    const term = word.replace(/s{2,}$/, "s");
    const singular = term.length >= 5 ? term.replace(/([aeiou])s$/, "$1") : term;
    return { word, term, singular };
  });
}

function searchContent(product: SearchableProduct) {
  return normalizeSearch([
    product.name,
    product.shortDescription,
    product.categoryName ?? "",
    product.categorySlug ?? "",
    ...(product.variants??[]).map(p=>`${p.name} ${p.variantLabel??""}`),
    ...(product.attributes ?? []).map((attribute) => attribute.value),
  ].join(" "));
}

const exactMatch = (content: string, { term, singular }: SearchTerm) => content.includes(term) || content.includes(singular);

export function searchProducts<T extends SearchableProduct>(products: T[], query: string): T[] {
  const terms = searchTerms(query);
  return products.filter((product) => {
    const content = searchContent(product);
    return terms.every((term) => exactMatch(content, term));
  });
}

// CONV-02: words a buyer types that the catalog stores differently. Matched as whole words of the product text.
const synonymGroups = [
  ["mujer", "mujeres", "dama", "damas", "femenino", "femenina", "femme", "woman", "women"],
  ["hombre", "hombres", "caballero", "caballeros", "masculino", "masculina", "homme", "man", "men"],
  ["perfume", "perfumes", "fragancia", "fragancias", "colonia", "colonias"],
  ["regalo", "regalos", "regalar", "obsequio"],
  ["termo", "termos", "termico", "termica"],
];
const synonyms = new Map(synonymGroups.flatMap(group => group.map(word => [word, group] as const)));
// Connectors ignored only in the recovery pass («perfumes para hombre»); exact search still requires them.
const connectors = new Set(["de", "del", "para", "con", "el", "la", "los", "las", "un", "una", "y", "en", "por"]);

/** Optimal string alignment distance (adjacent swaps count as one), stopping early beyond `max`. */
function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], rows[i - 2][j - 2] + 1);
    }
    if (Math.min(...row) > max) return max + 1;
    rows.push(row);
  }
  return rows[a.length][b.length];
}

function recoveredMatch(content: string, words: Set<string>, term: SearchTerm) {
  if (exactMatch(content, term)) return true;
  if ((synonyms.get(term.word) ?? synonyms.get(term.singular))?.some(word => words.has(word))) return true;
  // Typos: one letter for five or six letters, two from seven; shorter words are left alone.
  const allowed = term.word.length >= 7 ? 2 : term.word.length >= 5 ? 1 : 0;
  return allowed > 0 && [...words].some(word => word.length >= 4 && editDistance(term.word, word, allowed) <= allowed);
}

/**
 * The exact search, unchanged. Only when it finds nothing, a second pass accepts synonyms and small typos;
 * every word must still match. `recovered` tells the page to say the results are approximate.
 */
export function searchProductsWithRecovery<T extends SearchableProduct>(products: T[], query: string): { products: T[]; recovered: boolean } {
  const exact = searchProducts(products, query);
  const terms = searchTerms(query);
  const meaningful = terms.filter(term => !connectors.has(term.word));
  if (exact.length || !meaningful.length) return { products: exact, recovered: false };
  const recovered = products.filter(product => {
    const content = searchContent(product);
    const words = new Set(content.split(/[^a-z0-9]+/).filter(Boolean));
    return meaningful.every(term => recoveredMatch(content, words, term));
  });
  return { products: recovered, recovered: recovered.length > 0 };
}
