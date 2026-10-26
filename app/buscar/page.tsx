import Link from "next/link";
import { ProductGrid } from "@/components/product-grid";
import { SiteHeader } from "@/components/site-header";
import { searchProducts } from "@/lib/catalog/search";
import { getCatalogPublications } from "@/services/products";
import { AnalyticsView } from "@/components/analytics-view";

export const metadata = { title: "Buscar productos" };

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<{ buscar?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = (Array.isArray(params.buscar) ? params.buscar[0] : params.buscar ?? "").trim();
  const catalog = await getCatalogPublications();
  const products = searchProducts(catalog, query);

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader searchQuery={query} />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {query ? <AnalyticsView event="catalog_search" identity="search-results" params={{ result_count: products.length }} /> : null}
        <h1 className="break-words text-3xl font-semibold sm:text-4xl">
          {query ? `Resultados para “${query}”` : "Todos los productos"}
        </h1>
        <p className="mt-3 text-sm text-[#526479]">{products.length} {products.length === 1 ? "producto encontrado" : "productos encontrados"}</p>
        {products.length ? <ProductGrid products={products} label="Producto" /> : (
          <div className="mt-8 rounded-2xl border border-[#DCE3EA] bg-white p-6">
            <h2 className="text-xl font-semibold">No encontramos productos con esa búsqueda.</h2>
            <p className="mt-3">Probá con el nombre, la marca o una palabra más corta.</p>
            <Link href="/buscar" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#0072CE] px-5 text-sm font-semibold text-white">Ver todos los productos</Link>
          </div>
        )}
      </section>
    </main>
  );
}
