import { publicCategoryLabels as categoryLabels, publicCategoryPaths as categoryPaths } from "@/lib/catalog/public-product-visibility";
import { ProductFamilyDetail } from "@/components/product-family-detail";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-grid";
import { ProductDetailLayout, ProductDetailSummary } from "@/components/product-detail-layout";
import { ProductSupportSections } from "@/components/product-purchase-summary";
import { getPublicInstallments } from "@/lib/payments/installments";
import { APPROVED_MOCKUP_PRICES } from "@/lib/products/payment-prices";
import { getProductBySlug, getRelatedProducts } from "@/services/products";
import { ProductActions } from "./product-actions";
import { Suspense } from "react";
import { ComponentOffers } from "@/components/component-offers";
import { getProductCommercialInformation } from "@/lib/products/commercial-information";
import { ProductInformation } from "@/components/product-information";
import { AnalyticsView } from "@/components/analytics-view";
import { analyticsItem } from "@/lib/analytics/client";
import { isDecantProduct } from "@/lib/catalog/perfume-recommendation";

import surface from "@/components/storefront-surface.module.css";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{ vistaPreviaCuotas?: string | string[]; vistaPreviaPrecios?: string | string[] }>;
};

function createMetadataDescription(
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>,
) {
  const information = getProductCommercialInformation(product);
  const source = information.shortDescription || information.description || product.name;

  return source.length > 155 ? `${source.slice(0, 152).trim()}…` : source;
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
        "Producto de SFSTORE Importados. Consultá disponibilidad y opciones por WhatsApp.",
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

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  // Installments stay hidden until that payment method is enabled; a local development server can preview them.
  const preview = process.env.NODE_ENV === "development" ? await searchParams : undefined;
  // Visual comparison with the approved mockup (development only): reference amounts and installments, no purchase.
  const reference = preview?.vistaPreviaPrecios === "1" ? APPROVED_MOCKUP_PRICES : undefined;
  const installments = getPublicInstallments(!!reference || preview?.vistaPreviaCuotas === "1");

  const categoryLabel = categoryLabels[product.category];
  const categoryPath = categoryPaths[product.category];
  const relatedLabel = "Más en " + categoryLabel;
  const relatedProducts = (await getRelatedProducts(product.categoryId, product.id))
    .filter(related => related.category === product.category && related.id !== product.id && related.primaryImageUrl?.trim());
  const showShippingPreview = process.env.NODE_ENV === "development" && product.stock > 0
    && product.category === "perfumes" && product.kind !== "combo"
    && isDecantProduct({ id: product.id, name: product.name, slug: product.slug, attributes: product.attributes });

  return (
    <main data-storefront-theme="boutique" className="min-h-screen bg-[#F7F9FC] font-sans text-[#102033]">
      <AnalyticsView event="view_item" identity={product.id} params={{ items: [analyticsItem(product)].filter(Boolean) }} />
      <SiteHeader />
      <div className={`${surface.canvas} ${surface.botanicalCorner}`}>
        <div className="mx-auto max-w-6xl px-3 pb-10 pt-3 sm:px-6 md:px-20 md:pt-6 min-[1312px]:px-8">
          <nav aria-label="Ruta del producto" className="mb-1 flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-[var(--boutique-olive,#003B73)] md:mb-3 md:text-sm">
            <Link href="/" prefetch={false} className="hidden min-h-11 items-center hover:underline md:inline-flex">Inicio</Link>
            <span aria-hidden="true" className="hidden md:inline">/</span>
            <Link href={categoryPath} prefetch={false} className="inline-flex min-h-11 items-center hover:underline">
              <span aria-hidden="true" className="md:hidden">← </span>{categoryLabel}
            </Link>
            <span aria-hidden="true" className="hidden md:inline">/</span>
            <span aria-current="page" className="hidden break-words font-normal text-[var(--boutique-muted,#45576A)] md:inline">{product.name}</span>
          </nav>

          {product.kind === "family" ? <ProductFamilyDetail product={product} installments={installments} /> : (
            <ProductDetailLayout
              gallery={<ProductImageGallery images={product.images} placeholder={product.imagePlaceholder} productName={product.name} />}
              details={<>
                <ProductInformation product={product} standalone />
                <ProductSupportSections attributes={product.attributes} productName={product.name} showShippingPreview={showShippingPreview} />
              </>}
            >
              <ProductDetailSummary product={product} />
              <ProductActions product={product} installments={installments} reference={reference} />
              {product.kind !== "combo" ? <Suspense fallback={null}><ComponentOffers headId={product.id} /></Suspense> : null}
            </ProductDetailLayout>
          )}

          {relatedProducts.length ? <section aria-labelledby="related-products" className="mt-6 md:mt-9">
            <h2 id="related-products" className="mb-3 break-words text-xl font-bold tracking-tight text-[var(--boutique-heading,#102747)] sm:text-2xl">{relatedLabel}</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {relatedProducts.map(related => <ProductCard key={related.id} product={related} label={relatedLabel} directPurchase={false} presentation="related" hideLabel />)}
            </div>
          </section> : null}
        </div>
      </div>
    </main>
  );
}
