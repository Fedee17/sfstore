import type { Metadata } from "next";
import Link from "next/link";
import { CatalogSidebar } from "@/components/catalog/catalog-sidebar";
import { ProductGrid } from "@/components/product-grid";
import { SiteHeader } from "@/components/site-header";
import {
  MATE_CATALOG_CATEGORIES,
  MATE_FILTERS_BY_CATEGORY,
  normalizeMateCategory,
} from "@/lib/catalog/mate-filters";
import {
  CATALOG_ATTRIBUTE_KEYS,
  productHasCatalogAttribute,
  type CatalogAttributeKey,
} from "@/lib/catalog/attribute-config";
import { getProductsByCategorySlug } from "@/services/products";

export const metadata: Metadata = {
  title: "Mates, termos y accesorios",
  description:
    "Mates, termos, yerbas, bombillas y accesorios para armar tu ritual o resolver un regalo con identidad argentina.",
  openGraph: {
    title: "Mates, termos y accesorios",
    description:
      "Mates, termos, yerbas, bombillas y accesorios para armar tu ritual o resolver un regalo con identidad argentina.",
    url: "/mates",
  },
  twitter: {
    title: "Mates, termos y accesorios",
    description:
      "Mates, termos, yerbas, bombillas y accesorios para armar tu ritual o resolver un regalo con identidad argentina.",
  },
};

type MatesSearchParams = {
  categoria?: string;
  tipo?: string;
  color?: string;
  material?: string;
  uso?: string;
  capacidad?: string;
  trabajo?: string;
  incluye?: string;
  ocasion?: string;
  nivel?: string;
  estilo?: string;
  peso?: string;
  tamano?: string;
  personalizacion?: string;
  [key: string]: string | undefined;
};

type MatesPageProps = {
  searchParams?: Promise<MatesSearchParams>;
};

export default async function MatesPage({ searchParams }: MatesPageProps) {
  const params = (await searchParams) ?? {};
  const selectedCategory = normalizeMateCategory(params.categoria ?? "");
  const selectedCategoryItem = MATE_CATALOG_CATEGORIES.find(
    (category) => category.matchValue === selectedCategory,
  );
  const products = await getProductsByCategorySlug("mates");
  const candidateAttributeFilters: [CatalogAttributeKey, string | undefined][] =
    selectedCategory === "mates"
      ? [
          [CATALOG_ATTRIBUTE_KEYS.mateType, params.tipo],
          [CATALOG_ATTRIBUTE_KEYS.material, params.material],
          [CATALOG_ATTRIBUTE_KEYS.color, params.color],
          [CATALOG_ATTRIBUTE_KEYS.useCase, params.uso],
        ]
      : [];
  const activeAttributeFilters = candidateAttributeFilters.filter(
    (entry): entry is [CatalogAttributeKey, string] => Boolean(entry[1]),
  );
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory
      ? (product.categorySlug ?? product.category) === selectedCategory
      : true;

    return matchesCategory && activeAttributeFilters.every(([key, value]) =>
      productHasCatalogAttribute(product.attributes, key, value),
    );
  });

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
        <div className="mt-10 flex min-w-0 flex-col justify-between gap-6 overflow-hidden rounded-[2rem] border border-[#003B73]/15 bg-white/70 p-6 shadow-sm md:flex-row md:items-end sm:p-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              Catálogo
            </p>
            <h1 className="mt-3 break-words text-4xl font-semibold leading-tight sm:text-5xl">
              Mates y accesorios
            </h1>
            <p className="mt-4 max-w-2xl break-words text-sm leading-6 text-[#0072CE]">
              Armá tu ritual matero o encontrá un regalo completo.
            </p>
          </div>
          <p className="max-w-xl break-words text-base leading-7 text-[#102033]/70">
            Mates, termos, bombillas, yerbas y accesorios para todos los días o para regalar con identidad argentina.
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
                ariaLabel="Categorías de mates"
                basePath="/mates"
                categories={MATE_CATALOG_CATEGORIES}
                filtersByCategory={MATE_FILTERS_BY_CATEGORY}
                selectedCategory={selectedCategory}
              />
            </div>
          </details>
        </div>

        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] min-w-0 overflow-y-auto rounded-2xl border border-[#DCE3EA] bg-white p-5 shadow-sm lg:block">
            <CatalogSidebar
              ariaLabel="Categorías de mates"
              basePath="/mates"
              categories={MATE_CATALOG_CATEGORIES}
              filtersByCategory={MATE_FILTERS_BY_CATEGORY}
              selectedCategory={selectedCategory}
            />
          </aside>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-col gap-2 border-b border-[#DCE3EA] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0072CE]">
                  {selectedCategoryItem ? selectedCategoryItem.label : "Todos los productos"}
                </p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-[#102033]">
                  Armá tu ritual matero o encontrá un regalo completo.
                </h2>
                {selectedCategory === "bombillones" ? (
                  <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-[#102033]/65">
                    Bombillones trabajados: mejor terminación, materiales superiores y más presencia para mates premium.
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-sm text-[#102033]/55">
                {filteredProducts.length} {filteredProducts.length === 1 ? "producto" : "productos"}
              </p>
            </div>

            {filteredProducts.length > 0 ? (
              <ProductGrid products={filteredProducts} label="Mate" priceMode="compact" />
            ) : (
              <div className="mt-8 rounded-2xl border border-[#DCE3EA] bg-white p-8 text-center shadow-sm">
                <h3 className="text-xl font-semibold text-[#102033]">
                  No encontramos productos con esa combinación.
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#102033]/65">
                  Probá sacando algún filtro o volvé a ver toda la categoría.
                </p>
                <Link
                  href="/mates"
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
