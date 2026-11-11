import { publicCategoryLabels as categoryLabels, publicCategoryPaths as categoryPaths } from "@/lib/catalog/public-product-visibility";
import { ProductFamilyDetail } from "@/components/product-family-detail";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { SiteHeader } from "@/components/site-header";
import { HomeProductCarousel } from "@/app/home-product-card";
import { ProductPricePanel, ProductPurchaseConditions } from "@/components/product-purchase-summary";
import { getPerfumeCommercialCategory } from "@/lib/product-taxonomy";
import { getProductBySlug, getRelatedProducts } from "@/services/products";
import { ProductActions } from "./product-actions";
import { Suspense } from "react";
import { ComponentOffers } from "@/components/component-offers";
import { getProductCommercialInformation } from "@/lib/products/commercial-information";
import { ProductInformation } from "@/components/product-information";
import { AnalyticsView } from "@/components/analytics-view";
import { analyticsItem } from "@/lib/analytics/client";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function createMetadataDescription(
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>,
) {
  const information = getProductCommercialInformation(product);
  const source = information.shortDescription || information.description || product.name;

  return source.length > 155 ? `${source.slice(0, 152).trim()}...` : source;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return {
      title: "Producto",
      description:
        "Producto de SFSTORE Importados. ConsultÃ¡ disponibilidad y opciones por WhatsApp.",
    };
  }

  const description = createMetadataDescription(product);
  const images = product.primaryImageUrl
    ? [
        {
          url: product.primaryImageUrl,
          alt: product.primaryImageAlt ?? product.name,
        },
      ]
    : undefined;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      url: `/producto/${product.slug}`,
      images,
      type: "website",
    },
    twitter: {
      title: product.name,
      description,
      images: product.primaryImageUrl ? [product.primaryImageUrl] : undefined,
    },
  };
}

type ProductGalleryImageData = {
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
};

type ProductWithGalleryImages = {
  images?: ProductGalleryImageData[];
};

function getProductGalleryImages(product: unknown) {
  if (typeof product !== "object" || product === null || !("images" in product)) {
    return undefined;
  }

  return (product as ProductWithGalleryImages).images;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  if (product.kind === "family") return <ProductFamilyDetail product={product}/>;
  const information = getProductCommercialInformation(product);
  const isAvailable = product.stock > 0;
  const productAttributes =
    "attributes" in product && Array.isArray(product.attributes)
      ? product.attributes
      : undefined;
  const commercialCategory =
    product.category === "perfumes"
      ? getPerfumeCommercialCategory(productAttributes)
      : "";
  const relatedProducts = (await getRelatedProducts(
    product.categoryId,
    product.id,
  )).filter(related => related.category === product.category && related.id !== product.id);

  return (
    <main className="min-h-screen bg-[#F7F9FC] font-sans text-[#102033]">
      <AnalyticsView event="view_item" identity={product.id} params={{ items: [analyticsItem(product)].filter(Boolean) }} />
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-5 py-5 sm:px-8 sm:py-8 lg:py-12">
        <a
          href={categoryPaths[product.category]}
          className="mb-3 inline-flex max-w-full items-center rounded-full border border-[#003B73]/25 bg-white/60 px-4 py-2 text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:text-[#0072CE] sm:mb-5"
        >
          &larr; Volver a {categoryLabels[product.category].toLowerCase()}
        </a>

        <nav aria-label="Ruta del producto" className="hidden min-w-0 flex-wrap items-center gap-2 text-sm text-[#102033]/60 sm:flex">
          <Link
            className="font-medium text-[#003B73] transition hover:text-[#0072CE]"
            href="/"
            prefetch={false}
          >
            Inicio
          </Link>
          <span>/</span>
          <a
            className="font-medium text-[#003B73] transition hover:text-[#0072CE]"
            href={categoryPaths[product.category]}
          >
            {categoryLabels[product.category]}
          </a>
          <span>/</span>
          <span className="min-w-0 break-words text-[#102033]">
            {product.name}
          </span>
        </nav>

        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-10">
          <div className="min-w-0 overflow-hidden rounded-3xl border border-[#DCE3EA] bg-white">
            <ProductImageGallery
              fitViewport
              images={getProductGalleryImages(product)}
              placeholder={product.imagePlaceholder}
              productName={product.name}
            />
          </div>

          <article className="min-w-0 space-y-6 rounded-3xl bg-[#FFFDFA] p-5 sm:p-7">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="max-w-full break-words rounded-full bg-[#0072CE]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#003B73]">
                {categoryLabels[product.category]}
              </span>
              <span
                className={`max-w-full break-words rounded-full px-3 py-1 text-xs font-semibold ${
                  isAvailable
                    ? "bg-[#EEF2F6] text-[#003B73]"
                    : "bg-[#E52620]/10 text-[#E52620]"
                }`}
              >
                {isAvailable ? "En stock" : "Agotado"}
              </span>
              {commercialCategory ? (
                <span className="max-w-full break-words rounded-full bg-[#EEF2F6] px-3 py-1 text-xs font-semibold text-[#003B73]">
                  Categoría: {commercialCategory}
                </span>
              ) : null}
            </div>

            <h1 className="break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {product.name}
            </h1>
            {information.shortDescription ? <p className="mt-2 whitespace-pre-line break-words text-sm leading-6">{information.shortDescription}</p> : null}
            <ProductPricePanel price={product.price} />
            <ProductActions product={product} />
            <ProductPurchaseConditions attributes={productAttributes} />
            <div className="space-y-5"><ProductInformation product={product} /></div>
            {product.kind !== "combo" ? <Suspense fallback={null}><ComponentOffers headId={product.id}/></Suspense> : null}
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 lg:pb-24">
        <div className="flex min-w-0 flex-col justify-between gap-4 border-t border-[#003B73]/15 pt-10 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              Seguí explorando
            </p>
            <h2 className="mt-3 break-words text-3xl font-semibold">
              Más en {categoryLabels[product.category]}
            </h2>
          </div>
        </div>

        {relatedProducts.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-[#003B73]/15 bg-white/65 p-6 text-sm leading-6 text-[#102033]/65">
            Podés seguir explorando el catálogo.
          </div>
        ) : (
          <div className="mt-8">
            <HomeProductCarousel products={relatedProducts} label={`Más en ${categoryLabels[product.category]}`} />
          </div>
        )}
      </section>
    </main>
  );
}







