type SearchableProduct = {
  name: string;
  shortDescription: string;
  categoryName?: string;
  categorySlug?: string;
  variants?: {name:string;variantLabel?:string}[];
  attributes?: { name: string; value: string }[];
};

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").trim();
}

export function searchProducts<T extends SearchableProduct>(products: T[], query: string): T[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean).map((word) => {
    const term = word.replace(/s{2,}$/, "s");
    const singular = term.length >= 5 ? term.replace(/([aeiou])s$/, "$1") : term;
    return { term, singular };
  });
  return products.filter((product) => {
    const content = normalizeSearch([
      product.name,
      product.shortDescription,
      product.categoryName ?? "",
      product.categorySlug ?? "",
      ...(product.variants??[]).map(p=>`${p.name} ${p.variantLabel??""}`),
      ...(product.attributes ?? []).map((attribute) => attribute.value),
    ].join(" "));
    return terms.every(({ term, singular }) => content.includes(term) || content.includes(singular));
  });
}
