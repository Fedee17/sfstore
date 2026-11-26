import type { Metadata } from "next";
import { shareImage } from "@/lib/seo/share-image";
import { redirect } from "next/navigation";
import { MobileCatalogFilters } from "@/components/catalog/mobile-catalog-filters";
import { CatalogSidebar } from "@/components/catalog/catalog-sidebar";
import { ProductGrid } from "@/components/product-grid";
import { CatalogBackLink, CatalogEmptyState, CatalogFrame, catalogStyles } from "@/components/catalog/catalog-frame";
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
    <CatalogFrame>
      <section className="storefront-catalog mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-8">
        <header className={`${catalogStyles.divider} min-w-0 pb-4 lg:pb-5`}>
          <h1 className={`${catalogStyles.title} catalog-title break-words`}>{isArabicCatalog ? "Perfumes Árabes" : "Perfumes importados"}</h1>
          <p className={`${catalogStyles.lead} mt-2 max-w-xl text-sm leading-6 sm:text-base`}>
            Encontrá tu próxima fragancia por estilo, intensidad u ocasión.
          </p>
        </header>

        {selectedCategoryItem ? (
          <CatalogBackLink href="/perfumes" />
        ) : null}

        <MobileCatalogFilters basePath="/perfumes" categories={PERFUME_CATALOG_CATEGORIES} filtersByCategory={PERFUME_FILTERS_BY_CATEGORY} selectedCategory={selectedCategory} />

        <div className="mt-4 grid min-w-0 gap-5 lg:mt-5 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
          <aside className={`${catalogStyles.panel} hidden min-w-0 rounded-2xl p-3 lg:block`}>
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
            {!isArabicCatalog ? <div className={`${catalogStyles.divider} min-w-0 pb-2`}>
              <h2 className={`${catalogStyles.subtitle} break-words text-2xl leading-tight lg:text-[1.75rem]`}>
                {selectedCategoryItem ? selectedCategoryItem.label : "Todos los perfumes"}
              </h2>
            </div> : null}

            {filteredProducts.length > 0 ? (
              <ProductGrid products={availableFirst(filteredProducts)} label="Perfume" presentation="catalog" />
            ) : (
              <CatalogEmptyState title="No encontramos productos con esa combinación." text="Probá sacando algún filtro o volvé a ver toda la categoría." href="/perfumes" action="Limpiar filtros" titleAs={isArabicCatalog ? "h2" : "h3"} />
            )}
          </div>
        </div>
      </section>
    </CatalogFrame>
  );
}
