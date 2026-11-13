import type { Metadata } from "next";
import { shareImage } from "@/lib/seo/share-image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MobileCatalogFilters } from "@/components/catalog/mobile-catalog-filters";
import { CatalogSidebar } from "@/components/catalog/catalog-sidebar";
import { ProductGrid } from "@/components/product-grid";
import { SiteHeader } from "@/components/site-header";
import {
  PERFUME_CATALOG_CATEGORIES,
  PERFUME_FILTERS_BY_CATEGORY,
  isRetiredPerfumeCategory,
  normalizePerfumeCategory,
} from "@/lib/catalog/perfume-filters";
import {
  CATALOG_ATTRIBUTE_KEYS,
  productHasCatalogAttribute,
  type CatalogAttributeKey,
} from "@/lib/catalog/attribute-config";
import { getProductsByCategorySlug } from "@/services/products";
import { availableFirst } from "@/lib/catalog/availability-order";

export const metadata: Metadata = {
  title: "Perfumes importados y árabes",
  description:
    "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
  openGraph: {
    title: "Perfumes importados y árabes",
    description:
      "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
    url: "/perfumes",
    images: [shareImage],
  },
  twitter: {
    title: "Perfumes importados y árabes",
    description:
      "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
    images: [shareImage.url],
  },
};

type PerfumesSearchParams = {
  categoria?: string;
  intensidad?: string;
  familia?: string;
  momento?: string;
  genero?: string;
  estilo?: string;
  para?: string;
  presupuesto?: string;
  tamano?: string;
  uso?: string;
  marca?: string;
  [key: string]: string | undefined;
};

type PerfumesPageProps = {
  searchParams?: Promise<PerfumesSearchParams>;
};

export default async function PerfumesPage({ searchParams }: PerfumesPageProps) {
  const params = (await searchParams) ?? {};
  const query = new URLSearchParams();
  let removedRetiredCategory = false;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if ((key === "categoria" || key === "estilo") && isRetiredPerfumeCategory(value)) {
      removedRetiredCategory = true;
      continue;
    }
    query.set(key, value);
  }
  if (removedRetiredCategory) {
    const search = query.toString();
    redirect(search ? `/perfumes?${search}` : "/perfumes");
  }

  const selectedCategory = normalizePerfumeCategory(
    params.categoria ?? params.estilo ?? "",
  );
  const selectedCategoryItem = PERFUME_CATALOG_CATEGORIES.find(
    (category) => category.matchValue === selectedCategory,
  );
  const isArabicCatalog = selectedCategoryItem?.hrefValue === "arabe";
  const products = await getProductsByCategorySlug("perfumes");
  const candidateAttributeFilters: [CatalogAttributeKey, string | undefined][] = [
    [CATALOG_ATTRIBUTE_KEYS.commercialCategory, selectedCategory],
    [CATALOG_ATTRIBUTE_KEYS.olfactoryFamily, params.familia],
    [CATALOG_ATTRIBUTE_KEYS.intensity, params.intensidad],
    [CATALOG_ATTRIBUTE_KEYS.occasion, params.momento],
    [CATALOG_ATTRIBUTE_KEYS.gender, params.genero],
  ];
  const activeAttributeFilters = candidateAttributeFilters.filter(
    (entry): entry is [CatalogAttributeKey, string] => Boolean(entry[1]),
  );
  const filteredProducts = activeAttributeFilters.length > 0
    ? products.filter((product) =>
        activeAttributeFilters.every(([key, value]) =>
          productHasCatalogAttribute(product.attributes, key, value),
        ),
      )
    : products;

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />
      <section className="storefront-catalog mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-8">
        <header className="min-w-0 border-b border-[#DCE3EA] pb-4 lg:pb-5">
          <h1 className="catalog-title break-words">{isArabicCatalog ? "Perfumes Árabes" : "Perfumes importados"}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#41566B] sm:text-base">
            Encontrá tu próxima fragancia por estilo, intensidad u ocasión.
          </p>
        </header>

        {selectedCategoryItem ? (
          <Link href="/perfumes" className="mt-4 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[#DCE3EA] bg-white px-4 text-sm font-semibold text-[#003B73] hover:bg-[#E8F3FF] focus-visible:outline-2 focus-visible:outline-[#0072CE]">
            <span aria-hidden="true">←</span> Volver a categorías
          </Link>
        ) : null}

        <MobileCatalogFilters basePath="/perfumes" categories={PERFUME_CATALOG_CATEGORIES} filtersByCategory={PERFUME_FILTERS_BY_CATEGORY} selectedCategory={selectedCategory} />

        <div className="mt-4 grid min-w-0 gap-5 lg:mt-5 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
          <aside className="hidden min-w-0 rounded-2xl border border-[#DCE3EA] bg-white p-3 lg:block">
            <CatalogSidebar
              ariaLabel="Categorías comerciales de perfumes"
              basePath="/perfumes"
              categories={PERFUME_CATALOG_CATEGORIES}
              filtersByCategory={PERFUME_FILTERS_BY_CATEGORY}
              selectedCategory={selectedCategory}
              compactFilters
            />
          </aside>

          <div className="min-w-0">
            {!isArabicCatalog ? <div className="min-w-0 border-b border-[#DCE3EA] pb-2">
              <h2 className="break-words text-2xl font-bold leading-tight text-[#003B73] lg:text-[1.75rem]">
                {selectedCategoryItem ? selectedCategoryItem.label : "Todos los perfumes"}
              </h2>
            </div> : null}

            {filteredProducts.length > 0 ? (
              <ProductGrid products={availableFirst(filteredProducts)} label="Perfume" presentation="catalog" />
            ) : (
              <div className="mt-8 rounded-2xl border border-[#DCE3EA] bg-white p-8 text-center shadow-sm">
                <h3 className="text-xl font-semibold text-[#102033]">
                  No encontramos productos con esa combinación.
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#102033]/65">
                  Probá sacando algún filtro o volvé a ver toda la categoría.
                </p>
                <Link
                  href="/perfumes"
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#0072CE] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#003B73]"
                >
                  Limpiar filtros
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
