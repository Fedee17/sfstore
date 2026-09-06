import type { Metadata } from "next";
import Link from "next/link";
import { CatalogSidebar } from "@/components/catalog/catalog-sidebar";
import { ProductGrid } from "@/components/product-grid";
import { SiteHeader } from "@/components/site-header";
import {
  PERFUME_CATALOG_CATEGORIES,
  PERFUME_FILTERS_BY_CATEGORY,
  normalizePerfumeCategory,
} from "@/lib/catalog/perfume-filters";
import {
  CATALOG_ATTRIBUTE_KEYS,
  productHasCatalogAttribute,
  type CatalogAttributeKey,
} from "@/lib/catalog/attribute-config";
import { getProductsByCategorySlug } from "@/services/products";

export const metadata: Metadata = {
  title: "Perfumes importados y árabes",
  description:
    "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
  openGraph: {
    title: "Perfumes importados y árabes",
    description:
      "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
    url: "/perfumes",
  },
  twitter: {
    title: "Perfumes importados y árabes",
    description:
      "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
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
  const selectedCategory = normalizePerfumeCategory(
    params.categoria ?? params.estilo ?? "",
  );
  const selectedCategoryItem = PERFUME_CATALOG_CATEGORIES.find(
    (category) => category.matchValue === selectedCategory,
  );
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
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
        <div className="mt-10 flex min-w-0 flex-col justify-between gap-6 overflow-hidden rounded-[2rem] border border-[#003B73]/15 bg-white/55 p-6 shadow-sm md:flex-row md:items-end sm:p-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              Catálogo
            </p>
            <h1 className="mt-3 break-words text-4xl font-semibold leading-tight sm:text-5xl">
              Perfumes importados
            </h1>
            <p className="mt-4 max-w-2xl break-words text-sm leading-6 text-[#0072CE]">
              No elijas por marca: elegí según cómo querés oler.
            </p>
          </div>
          <p className="max-w-xl break-words text-base leading-7 text-[#102033]/70">
            Te ayudamos a elegir según tu estilo, ocasión y presupuesto. Aromas para todos los días, regalos, salidas y momentos con presencia.
          </p>
        </div>

        <div className="mt-6 lg:hidden">
          <details className="group overflow-hidden rounded-2xl border border-[#DCE3EA] bg-white shadow-sm">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-[#003B73] marker:content-none">
              <span>Categorías y filtros</span>
              <span
                aria-hidden="true"
                className="text-xl leading-none transition group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="border-t border-[#DCE3EA] p-4">
              <CatalogSidebar
                ariaLabel="Categorías comerciales de perfumes"
                basePath="/perfumes"
                categories={PERFUME_CATALOG_CATEGORIES}
                filtersByCategory={PERFUME_FILTERS_BY_CATEGORY}
                selectedCategory={selectedCategory}
                viewAllLabel="Ver todos de esta categoría"
              />
            </div>
          </details>
        </div>

        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] min-w-0 overflow-y-auto rounded-2xl border border-[#DCE3EA] bg-white p-5 shadow-sm lg:block">
            <CatalogSidebar
              ariaLabel="Categorías comerciales de perfumes"
              basePath="/perfumes"
              categories={PERFUME_CATALOG_CATEGORIES}
              filtersByCategory={PERFUME_FILTERS_BY_CATEGORY}
              selectedCategory={selectedCategory}
              viewAllLabel="Ver todos de esta categoría"
            />
          </aside>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-col gap-2 border-b border-[#DCE3EA] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0072CE]">
                  {selectedCategoryItem ? selectedCategoryItem.label : "Todos los perfumes"}
                </p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-[#102033]">
                  Encontrá el aroma que mejor acompaña tu estilo.
                </h2>
              </div>
              <p className="shrink-0 text-sm text-[#102033]/55">
                {filteredProducts.length} {filteredProducts.length === 1 ? "producto" : "productos"}
              </p>
            </div>

            {filteredProducts.length > 0 ? (
              <ProductGrid products={filteredProducts} label="Perfume" />
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
