export type QuickCatalogAttribute = {
  name: string;
  value: string;
};

export type QuickCatalogImage = {
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type QuickCatalogProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  status: string;
  stock: number;
  price: number;
  transfer_price: number | null;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  attributes: QuickCatalogAttribute[];
  images: QuickCatalogImage[];
};

export type QuickCatalogFilters = {
  search?: string;
  categoryId?: string;
  status?: string;
  stock?: "in" | "out";
  attributes?: Record<string, string>;
};

export function normalizeQuickCatalogText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function productMatchesSearch(product: QuickCatalogProduct, search: string) {
  const searchable = [
    product.name,
    product.slug,
    product.sku,
    product.category?.name,
    ...product.attributes.flatMap((attribute) => [
      attribute.name,
      attribute.value,
    ]),
  ]
    .map(normalizeQuickCatalogText)
    .join(" ");

  return search.split(" ").every((term) => searchable.includes(term));
}

function productHasAttribute(
  product: QuickCatalogProduct,
  attributeName: string,
  attributeValue: string,
) {
  const normalizedName = normalizeQuickCatalogText(attributeName);
  const normalizedValue = normalizeQuickCatalogText(attributeValue);

  return product.attributes.some(
    (attribute) =>
      normalizeQuickCatalogText(attribute.name) === normalizedName &&
      normalizeQuickCatalogText(attribute.value) === normalizedValue,
  );
}

export function filterQuickCatalogProducts(
  products: QuickCatalogProduct[],
  filters: QuickCatalogFilters,
) {
  const search = normalizeQuickCatalogText(filters.search);
  const attributeFilters = Object.entries(filters.attributes ?? {}).filter(
    ([, value]) => Boolean(value),
  );

  return products.filter((product) => {
    if (search && !productMatchesSearch(product, search)) return false;
    if (filters.categoryId && product.category?.id !== filters.categoryId) {
      return false;
    }
    if (filters.status && product.status !== filters.status) return false;
    if (filters.stock === "in" && product.stock <= 0) return false;
    if (filters.stock === "out" && product.stock > 0) return false;

    return attributeFilters.every(([name, value]) =>
      productHasAttribute(product, name, value),
    );
  });
}

export function getQuickCatalogPrimaryImage(product: QuickCatalogProduct) {
  return (
    [...product.images].sort(
      (left, right) =>
        Number(right.is_primary) - Number(left.is_primary) ||
        left.sort_order - right.sort_order,
    )[0] ?? null
  );
}
