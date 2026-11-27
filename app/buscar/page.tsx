import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { isLikelyBot, searchDemandOutcome, searchDemandTerm } from "@/lib/catalog/search-demand";
import { recordSearchDemand } from "@/services/search-demand";
import { ProductGrid } from "@/components/product-grid";
import { CatalogFrame, catalogStyles } from "@/components/catalog/catalog-frame";
import { searchProductsWithRecovery } from "@/lib/catalog/search";
import { getCatalogPublications } from "@/services/products";
import { AnalyticsView } from "@/components/analytics-view";
import { availableFirst, availableWithPhoto } from "@/lib/catalog/availability-order";

export const metadata = { title: "Buscar productos" };

const alternativesLimit = 4;

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<{ buscar?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = (Array.isArray(params.buscar) ? params.buscar[0] : params.buscar ?? "").trim();
  const catalog = await getCatalogPublications();
  const { products, recovered } = searchProductsWithRecovery(catalog, query);
  // CONV-02: a search with no results still offers a way on: available products with a photo, featured first.
  const alternatives = products.length ? [] : availableWithPhoto(catalog, alternativesLimit);
  // Unmet demand: normalized term only, recorded after the response; crawlers and router prefetches are skipped.
  const demandTerm = query ? searchDemandTerm(query) : null;
  const outcome = searchDemandOutcome(products.length, recovered);
  if (demandTerm && outcome) {
    const request = await headers();
    const prefetch = request.get("next-router-prefetch") !== null || request.get("purpose") === "prefetch";
    if (!prefetch && !isLikelyBot(request.get("user-agent"))) after(() => recordSearchDemand(demandTerm, outcome));
  }

  return (
    <CatalogFrame searchQuery={query}>
      <section className="storefront-catalog mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {query ? <AnalyticsView event="catalog_search" identity="search-results" params={{ result_count: products.length }} /> : null}
        <h1 className={`${catalogStyles.title} catalog-title break-words`}>
          {query ? `Resultados para “${query}”` : "Todos los productos"}
        </h1>
        <p className={`${catalogStyles.count} mt-3 text-sm`}>{products.length} {products.length === 1 ? "producto encontrado" : "productos encontrados"}</p>
        {recovered ? <p className={`${catalogStyles.emptyText} mt-2 text-sm`}>No hubo coincidencias exactas. Te mostramos los productos más parecidos a tu búsqueda.</p> : null}
        {products.length ? <ProductGrid products={availableFirst(products)} label="Producto" presentation="catalog" /> : (
          <>
            <div className={`${catalogStyles.panel} mt-8 rounded-2xl p-6`}>
              <h2 className={`${catalogStyles.heading} catalog-subtitle`}>No encontramos productos con esa búsqueda.</h2>
              <p className={`${catalogStyles.emptyText} mt-3`}>Probá con el nombre, la marca o una palabra más corta.</p>
              <Link href="/buscar" className={`${catalogStyles.primary} mt-5 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold`}>Ver todos los productos</Link>
            </div>
            {alternatives.length ? <section aria-labelledby="search-alternatives" className="mt-10">
              <h2 id="search-alternatives" className={`${catalogStyles.heading} catalog-subtitle`}>Te pueden interesar</h2>
              <ProductGrid products={alternatives} label="Sugerido" presentation="catalog" />
            </section> : null}
          </>
        )}
      </section>
    </CatalogFrame>
  );
}
