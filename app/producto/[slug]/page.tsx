import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { SiteHeader } from "@/components/site-header";
import {
  formatSavingsLabel,
  getTransferUnitPrice,
  hasTransferPrice,
} from "@/lib/pricing";
import { getProductBySlug, getRelatedProducts } from "@/services/products";
import { ProductActions } from "./product-actions";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function createMetadataDescription(
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>,
) {
  const source = product.shortDescription || product.description || product.name;

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

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const categoryLabels = {
  perfumes: "Perfumes",
  mates: "Mates",
} as const;

const categoryPaths = {
  perfumes: "/perfumes",
  mates: "/mates",
} as const;

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

function ProductImage({
  product,
  size = "large",
}: {
  product: Awaited<ReturnType<typeof getProductBySlug>>;
  size?: "large" | "small";
}) {
  if (!product) {
    return null;
  }

  if (product.primaryImageUrl) {
    return (
      <div className="aspect-square overflow-hidden bg-[#102033]">
        <img
          src={product.primaryImageUrl}
          alt={product.primaryImageAlt ?? product.name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-square items-center justify-center bg-[#102033] text-white">
      <span
        className={
          size === "large"
            ? "break-all px-4 text-center text-7xl font-semibold tracking-wide text-[#DCE3EA] sm:text-8xl"
            : "break-all px-4 text-center text-4xl font-semibold tracking-wide text-[#DCE3EA]"
        }
      >
        {product.imagePlaceholder}
      </span>
    </div>
  );
}

function PricePanel({
  product,
  isAvailable,
}: {
  product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;
  isAvailable: boolean;
}) {
  const showTransferPrice = hasTransferPrice(product);
  const transferPrice = getTransferUnitPrice(product);
  const savingsLabel = formatSavingsLabel(product.price, product.transferPrice);

  return (
    <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-[#003B73]/15 bg-[#F7F9FC] p-5">
      {showTransferPrice ? (
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)] md:items-end">
          <div className="min-w-0">
            <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#0072CE]">
              Precio efectivo/transferencia
            </p>
            <p className="mt-2 break-words text-4xl font-semibold leading-tight text-[#102033] sm:text-5xl">
              {currencyFormatter.format(transferPrice)}
            </p>
            {savingsLabel ? (
              <span className="mt-3 inline-flex max-w-full rounded-full bg-[#0072CE] px-3 py-1 text-sm font-semibold text-white">
                {savingsLabel}
              </span>
            ) : null}
            <p className="mt-3 break-words text-sm font-medium text-[#0072CE]">
              Pagando por transferencia o efectivo accedÃ©s al mejor precio.
            </p>
            <p className="mt-2 break-words text-sm text-[#102033]/55">
              Mercado Pago y tarjeta usan precio lista.
            </p>
          </div>
          <div className="min-w-0 rounded-2xl border border-[#003B73]/15 bg-white/70 p-4">
            <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#003B73]">
              Precio lista
            </p>
            <p className="mt-2 break-words text-xl font-semibold text-[#102033]/70">
              {currencyFormatter.format(product.price)}
            </p>
          </div>
        </div>
      ) : (
        <div className="min-w-0">
          <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#003B73]">
            Precio lista
          </p>
          <p className="mt-2 break-words text-4xl font-semibold leading-tight text-[#102033] sm:text-5xl">
            {currencyFormatter.format(product.price)}
          </p>
        </div>
      )}

      {isAvailable ? (
        <p className="mt-4 break-words text-sm font-medium text-[#0072CE]">
          Stock disponible: {product.stock} unidad
          {product.stock === 1 ? "" : "es"}
        </p>
      ) : (
        <p className="mt-4 break-words text-sm font-medium text-[#003B73]">
          Sin stock por ahora. Consultanos y te avisamos si vuelve a entrar.
        </p>
      )}
    </div>
  );
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const isAvailable = product.stock > 0;
  const relatedProducts = await getRelatedProducts(
    product.categoryId,
    product.id,
  );

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
        <a
          href={categoryPaths[product.category]}
          className="mb-5 inline-flex max-w-full items-center rounded-full border border-[#003B73]/25 bg-white/60 px-4 py-2 text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:text-[#0072CE]"
        >
          &larr; Volver a {categoryLabels[product.category].toLowerCase()}
        </a>

        <nav className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-[#102033]/60">
          <a
            className="font-medium text-[#003B73] transition hover:text-[#0072CE]"
            href="/"
          >
            Inicio
          </a>
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

        <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="min-w-0 overflow-hidden rounded-[2rem] border border-[#003B73]/15 bg-[#102033] shadow-2xl shadow-[#102033]/10">
            <ProductImageGallery
              images={getProductGalleryImages(product)}
              placeholder={product.imagePlaceholder}
              productName={product.name}
            />
          </div>

          <article className="min-w-0 overflow-hidden rounded-[2rem] border border-[#003B73]/15 bg-white/70 p-6 shadow-sm sm:p-8">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="max-w-full break-words rounded-full bg-[#0072CE]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#0072CE]">
                {categoryLabels[product.category]}
              </span>
              <span
                className={`max-w-full break-words rounded-full px-3 py-1 text-xs font-semibold ${
                  isAvailable
                    ? "bg-[#0072CE] text-white"
                    : "bg-[#E52620]/10 text-[#E52620]"
                }`}
              >
                {isAvailable ? "En stock" : "Agotado"}
              </span>
            </div>

            <h1 className="mt-6 break-words text-4xl font-semibold leading-tight sm:text-5xl">
              {product.name}
            </h1>
            <p className="mt-5 break-words text-lg leading-8 text-[#102033]/70">
              {product.description ?? product.shortDescription}
            </p>

            <PricePanel product={product} isAvailable={isAvailable} />
            <ProductActions product={product} />
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 lg:pb-24">
        <div className="flex min-w-0 flex-col justify-between gap-4 border-t border-[#003B73]/15 pt-10 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              TambiÃ©n te puede gustar
            </p>
            <h2 className="mt-3 break-words text-3xl font-semibold">
              Productos relacionados
            </h2>
          </div>
          <a
            href={categoryPaths[product.category]}
            className="text-sm font-semibold text-[#0072CE] transition hover:text-[#003B73]"
          >
            Ver {categoryLabels[product.category].toLowerCase()}
          </a>
        </div>

        {relatedProducts.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-[#003B73]/15 bg-white/65 p-6 text-sm leading-6 text-[#102033]/65">
            PodÃ©s seguir explorando perfumes y mates para encontrar otra opciÃ³n.
          </div>
        ) : (
          <div className="mt-8 grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((relatedProduct) => {
            const relatedHasTransferPrice = hasTransferPrice(relatedProduct);
            const relatedTransferPrice = getTransferUnitPrice(relatedProduct);
            const relatedSavingsLabel = formatSavingsLabel(
              relatedProduct.price,
              relatedProduct.transferPrice,
            );

            return (
              <a
                key={relatedProduct.id}
                href={`/producto/${relatedProduct.slug}`}
                className="group min-w-0 overflow-hidden rounded-3xl border border-[#003B73]/15 bg-white/70 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-[#102033]/10"
              >
                {relatedProduct.primaryImageUrl ? (
                  <div className="aspect-[4/3] overflow-hidden bg-[#102033]">
                    <img
                      src={relatedProduct.primaryImageUrl}
                      alt={relatedProduct.primaryImageAlt ?? relatedProduct.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                ) : (
                  <div className="overflow-hidden bg-[#102033]">
                    <ProductImage product={relatedProduct} size="small" />
                  </div>
                )}

                <div className="min-w-0 p-5">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#003B73]">
                      {categoryLabels[relatedProduct.category]}
                    </p>
                    <span className="break-words text-xs font-semibold text-[#0072CE]">
                      {relatedProduct.stock > 0 ? "En stock" : "Agotado"}
                    </span>
                  </div>
                  <h3 className="mt-3 break-words text-lg font-semibold text-[#102033] group-hover:text-[#0072CE]">
                    {relatedProduct.name}
                  </h3>
                  {relatedHasTransferPrice ? (
                    <div className="mt-3 min-w-0">
                      <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#0072CE]">
                        Efectivo / transferencia
                      </p>
                      <p className="break-words text-lg font-semibold text-[#102033]">
                        {currencyFormatter.format(relatedTransferPrice)}
                      </p>
                      {relatedSavingsLabel ? (
                        <span className="mt-1 inline-flex max-w-full rounded-full bg-[#0072CE]/10 px-2.5 py-1 text-xs font-semibold text-[#0072CE]">
                          {relatedSavingsLabel}
                        </span>
                      ) : null}
                      <p className="mt-1 break-words text-xs text-[#102033]/55">
                        Lista: {currencyFormatter.format(relatedProduct.price)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 break-words text-lg font-semibold text-[#003B73]">
                      {currencyFormatter.format(relatedProduct.price)}
                    </p>
                  )}
                </div>
              </a>
            );
            })}
          </div>
        )}
      </section>
    </main>
  );
}







