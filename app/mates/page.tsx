import type { Metadata } from "next";
import { shareImage } from "@/lib/seo/share-image";
import { MobileCatalogFilters } from "@/components/catalog/mobile-catalog-filters";
import { CatalogSidebar } from "@/components/catalog/catalog-sidebar";
import { ProductGrid } from "@/components/product-grid";
import { CatalogBackLink, CatalogEmptyState, CatalogFrame, catalogStyles } from "@/components/catalog/catalog-frame";
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
import { orderCatalog, parseCatalogOrder } from "@/lib/catalog/availability-order";
import { CatalogSortControl } from "@/components/catalog/catalog-sort-control";

export const metadata: Metadata = {
  title: "Mates, termos y accesorios",
  description:
    "Mates, termos, yerbas, bombillas y accesorios para armar tu ritual o resolver un regalo con identidad argentina.",
  openGraph: {
    title: "Mates, termos y accesorios",
    description:
      "Mates, termos, yerbas, bombillas y accesorios para armar tu ritual o resolver un regalo con identidad argentina.",
    url: "/mates",
    images: [shareImage],
  },
  twitter: {
    title: "Mates, termos y accesorios",
    description:
      "Mates, termos, yerbas, bombillas y accesorios para armar tu ritual o resolver un regalo con identidad argentina.",
    images: [shareImage.url],
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
  orden?: string;
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
  const showSidebar = !selectedCategoryItem || Boolean(MATE_FILTERS_BY_CATEGORY[selectedCategoryItem.matchValue]?.length);
  const products = await getProductsByCategorySlug("mates");
  const order = parseCatalogOrder(params.orden);
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
    <CatalogFrame>
      <section className="storefront-catalog mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-8">
        <header className={`${catalogStyles.divider} min-w-0 pb-4 lg:pb-5`}>
          <h1 className={`${catalogStyles.title} catalog-title break-words`}>{selectedCategoryItem?.label ?? "Mates y accesorios"}</h1>
          <p className={`${catalogStyles.lead} mt-2 max-w-xl text-sm leading-6 sm:text-base`}>
            {selectedCategory === "bombillones"
              ? "Bombillones trabajados: mejor terminación, materiales superiores y más presencia para mates premium."
              : "Mates, termos, bombillas, yerbas y accesorios para todos los días o para regalar."}
          </p>
        </header>

        {selectedCategoryItem ? (
          <CatalogBackLink href="/mates" />
        ) : null}

        <MobileCatalogFilters basePath="/mates" categories={MATE_CATALOG_CATEGORIES} filtersByCategory={MATE_FILTERS_BY_CATEGORY} selectedCategory={selectedCategory} />

        <div className={`mt-4 grid min-w-0 gap-5 lg:mt-5 lg:items-start ${showSidebar ? "lg:grid-cols-[210px_minmax(0,1fr)]" : ""}`}>
          {showSidebar ? <aside className={`${catalogStyles.panel} hidden min-w-0 rounded-2xl p-3 lg:block`}>
            <CatalogSidebar
              ariaLabel="Categorías de mates"
              basePath="/mates"
              categories={MATE_CATALOG_CATEGORIES}
              filtersByCategory={MATE_FILTERS_BY_CATEGORY}
              selectedCategory={selectedCategory}
              compactFilters
            />
          </aside> : null}

          <div className="min-w-0">
            {filteredProducts.length > 1 ? <div className="mb-3"><CatalogSortControl basePath="/mates" params={params} order={order} /></div> : null}

            {filteredProducts.length > 0 ? (
              <ProductGrid products={orderCatalog(filteredProducts, order)} label="Mate" priceMode="compact" presentation="catalog" />
            ) : (
              <CatalogEmptyState title="No encontramos productos con esa combinación." text="Probá sacando algún filtro o volvé a ver toda la categoría." href="/mates" action="Limpiar filtros" />
            )}
          </div>
        </div>
      </section>
    </CatalogFrame>
  );
}
