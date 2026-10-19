type SearchableProduct = {
  name: string;
  shortDescription: string;
  categoryName?: string;
  variants?: {name:string;variantLabel?:string}[];
  attributes?: { name: string; value: string }[];
};

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").trim();
}

export function searchProducts<T extends SearchableProduct>(products: T[], query: string): T[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return products.filter((product) => {
    const content = normalizeSearch([
      product.name,
      product.shortDescription,
      product.categoryName ?? "",
      ...(product.variants??[]).map(p=>`${p.name} ${p.variantLabel??""}`),
      ...(product.attributes ?? []).map((attribute) => attribute.value),
    ].join(" "));
    return terms.every((term) => content.includes(term));
  });
}
