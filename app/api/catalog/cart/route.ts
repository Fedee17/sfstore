import { unstable_cache } from "next/cache";
import { getCatalogPublications } from "@/services/products";

// Owner request 20/11: read-only current list price, cash price and stock of the public SKUs in a cart, so the cart can warn
// about changes before checkout. Checkout keeps validating server-side; this never writes anything.
const readCartCatalog = unstable_cache(async () => {
  const products = await getCatalogPublications();
  if (!products.length) throw new Error("Catálogo del carrito no disponible");
  const rows: Record<string, { price: number; cashPrice: number | null; stock: number }> = {};
  for (const product of products.flatMap(product => [product, ...(product.variants ?? [])])) {
    if (product.kind !== "family" && product.kind !== "combo") rows[product.id] = { price: product.price, cashPrice: product.transferPrice ?? null, stock: product.stock };
  }
  return rows;
}, ["public-cart-catalog-v2"], { revalidate: 60 });

const maxIds = 50;
const idPattern = /^[A-Za-z0-9-]{1,64}$/;

export async function GET(request: Request) {
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean))];
  if (!ids.length || ids.length > maxIds || !ids.every(id => idPattern.test(id))) return Response.json({}, { status: 400 });
  try {
    const catalog = await readCartCatalog();
    return Response.json(Object.fromEntries(ids.filter(id => Object.hasOwn(catalog, id)).map(id => [id, catalog[id]])));
  } catch {
    return Response.json({}, { status: 503 });
  }
}
