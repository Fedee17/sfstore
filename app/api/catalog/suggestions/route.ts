import { unstable_cache } from "next/cache";
import { searchProducts, normalizeSearch } from "@/lib/catalog/search";
import { getCatalogPublications } from "@/services/products";

const readSuggestionCatalog = unstable_cache(async () => {
  const products = await getCatalogPublications();
  if (!products.length) throw new Error("Catálogo de sugerencias no disponible");
  return products.map(({ slug, name, shortDescription, categoryName, categorySlug, variants, attributes }) => ({
    slug, name, shortDescription, categoryName, categorySlug,
    variants: variants?.map(({ name, variantLabel }) => ({ name, variantLabel })),
    attributes: attributes?.map(({ name, value }) => ({ name, value })),
  }));
}, ["public-catalog-suggestions-v2"], { revalidate: 60 });

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 80) return Response.json([]);

  try {
    const products = searchProducts(await readSuggestionCatalog(), query);
    const term = normalizeSearch(query);
    const direct = products.filter((product) => normalizeSearch(product.name).includes(term));
    const related = products.filter((product) => !normalizeSearch(product.name).includes(term));
    return Response.json([...direct, ...related].slice(0, 6).map(({ slug, name }) => ({ slug, name })));
  } catch {
    return Response.json([], { status: 503 });
  }
}
