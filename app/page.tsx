import type { Metadata } from "next";
import { HomeHeroSlider, type HomeHeroSlide } from "@/components/home-hero-slider";
import { SiteHeader } from "@/components/site-header";
import { brand } from "@/lib/brand";
import { getTransferUnitPrice, hasTransferPrice } from "@/lib/pricing";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getProductsByCategorySlug, type PublicProduct } from "@/services/products";

export const metadata: Metadata = {
  title: "Perfumes, mates y regalos importados",
  description:
    "Elegí perfumes importados, perfumes árabes, mates, termos y regalos con ayuda personalizada. Comprá online o consultá por WhatsApp.",
  openGraph: {
    title: "Perfumes, mates y regalos importados",
    description:
      "Elegí perfumes importados, perfumes árabes, mates, termos y regalos con ayuda personalizada. Comprá online o consultá por WhatsApp.",
    url: "/",
  },
  twitter: {
    title: "Perfumes, mates y regalos importados",
    description:
      "Elegí perfumes importados, perfumes árabes, mates, termos y regalos con ayuda personalizada. Comprá online o consultá por WhatsApp.",
  },
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const categoryLabels: Record<PublicProduct["category"], string> = {
  perfumes: "Perfumes",
  mates: "Mates",
};

const benefits = [
  {
    title: "Enviamos tu compra",
    description: "Entregas a todo el país",
    icon: "shipping",
  },
  {
    title: "Pagá como quieras",
    description: "Tarjetas de crédito o efectivo",
    icon: "payment",
  },
  {
    title: "Comprá con seguridad",
    description: "Tus datos siempre protegidos",
    icon: "security",
  },
] as const;

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function getCategoryLabel(product: PublicProduct) {
  return product.categoryName ?? categoryLabels[product.category];
}

function getFirstVisualProduct(products: PublicProduct[]) {
  return products.find((product) => product.primaryImageUrl) ?? products[0] ?? null;
}


function getHomeFeaturedProducts(products: PublicProduct[]) {
  const featured = products.filter((product) => product.featured);
  return (featured.length > 0 ? featured : products).slice(0, 6);
}

function ProductVisual({
  product,
  label,
  className = "",
  loading = "lazy",
}: {
  product?: PublicProduct | null;
  label: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  if (product?.primaryImageUrl) {
    return (
      <div className={`relative min-w-0 overflow-hidden rounded-[1.5rem] bg-[#102033] ${className}`}>
        <img
          src={product.primaryImageUrl}
          alt={product.primaryImageAlt ?? product.name}
          loading={loading}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#102033]/90 via-[#102033]/45 to-transparent p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
            {label}
          </p>
          <p className="mt-1 line-clamp-2 break-words text-sm font-semibold">
            {product.name}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-w-0 flex-col justify-between overflow-hidden rounded-[1.5rem] border border-[#003B73]/15 bg-[#F7F9FC] p-5 ${className}`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#003B73]">
          {label}
        </p>
        <p className="mt-3 break-words text-3xl font-semibold text-[#102033]">
          {product?.imagePlaceholder ?? "SF"}
        </p>
      </div>
      <p className="mt-8 break-words text-sm leading-6 text-[#102033]/65">
        {product?.name ?? "Selección SFSTORE"}
      </p>
    </div>
  );
}

function SimplePrice({ product }: { product: PublicProduct }) {
  const price = hasTransferPrice(product)
    ? getTransferUnitPrice(product)
    : product.price;

  return (
    <p className="break-words text-2xl font-semibold text-[#102033]">
      {formatCurrency(price)}
    </p>
  );
}

function BenefitIcon({ type }: { type: (typeof benefits)[number]["icon"] }) {
  if (type === "shipping") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h3l3 3v3h-6z" />
        <path d="M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      </svg>
    );
  }

  if (type === "payment") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
        <path d="M2 10h20M6 15h4" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 5 6v5c0 4.5 2.9 8.4 7 10 4.1-1.6 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

function BenefitCard({ benefit }: { benefit: (typeof benefits)[number] }) {
  return (
    <article className="flex min-w-0 gap-4 rounded-3xl border border-[#003B73]/15 bg-white/75 p-5 shadow-sm">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0072CE]/10 text-[#0072CE]">
        <BenefitIcon type={benefit.icon} />
      </div>
      <div className="min-w-0">
        <h3 className="break-words text-base font-semibold text-[#102033]">
          {benefit.title}
        </h3>
        <p className="mt-1 break-words text-sm leading-6 text-[#102033]/60">
          {benefit.description}
        </p>
      </div>
    </article>
  );
}

function CategoryCard({
  href,
  title,
  eyebrow,
  description,
  product,
  tone,
  isExternal = false,
}: {
  href?: string;
  title: string;
  eyebrow: string;
  description: string;
  product?: PublicProduct | null;
  tone: "olive" | "leather" | "cream" | "dark";
  isExternal?: boolean;
}) {
  const toneClasses = {
    olive: "border-[#0072CE]/20 bg-[#0072CE]/10 text-[#0072CE]",
    leather: "border-[#003B73]/20 bg-[#EEF2F6] text-[#003B73]",
    cream: "border-[#DCE3EA]/45 bg-[#F7F9FC] text-[#003B73]",
    dark: "border-[#102033]/15 bg-[#102033] text-white",
  }[tone];
  const content = (
    <>
      <ProductVisual product={product} label={eyebrow} className="aspect-[4/3]" />
      <div className="min-w-0 px-1 pb-1">
        <p className="text-sm font-semibold uppercase tracking-[0.12em]">{eyebrow}</p>
        <h3 className={`mt-3 break-words text-2xl font-semibold ${tone === "dark" ? "text-white" : "text-[#102033]"}`}>
          {title}
        </h3>
        <p className={`mt-3 break-words text-sm leading-6 ${tone === "dark" ? "text-white/70" : "text-[#102033]/65"}`}>
          {description}
        </p>
      </div>
    </>
  );

  if (!href) {
    return (
      <article className={`grid min-w-0 gap-5 overflow-hidden rounded-3xl border p-4 sm:p-5 ${toneClasses}`}>
        {content}
      </article>
    );
  }

  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
      className={`group grid min-w-0 gap-5 overflow-hidden rounded-3xl border p-4 transition hover:-translate-y-1 hover:bg-white/80 sm:p-5 ${toneClasses}`}
    >
      {content}
    </a>
  );
}

function GuideCard({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <article className="min-w-0 rounded-3xl border border-[#003B73]/15 bg-white/70 p-5 shadow-sm">
      <span className="inline-flex rounded-full bg-[#0072CE]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#0072CE]">
        {label}
      </span>
      <h3 className="mt-5 break-words text-xl font-semibold text-[#102033]">
        {title}
      </h3>
      <p className="mt-3 break-words text-sm leading-6 text-[#102033]/65">
        {description}
      </p>
    </article>
  );
}

export default async function Home() {
  const [perfumes, mates] = await Promise.all([
    getProductsByCategorySlug("perfumes"),
    getProductsByCategorySlug("mates"),
  ]);

  const allProducts = [...perfumes, ...mates];
  const featuredProducts = getHomeFeaturedProducts(allProducts);
  const perfumeVisual = getFirstVisualProduct(perfumes);
  const mateVisual = getFirstVisualProduct(mates);
  const giftWhatsAppLink = buildWhatsAppUrl(
    "Hola SFSTORE, quiero armar un regalo y necesito ayuda para elegir.",
  );
  const generalWhatsAppLink = buildWhatsAppUrl(
    "Hola SFSTORE, quiero hacer una consulta desde la web.",
  );
  const heroSlides: HomeHeroSlide[] = [
    {
      imageSrc: "/home-banner-perfumes.png",
      imageAlt: "Perfumes importados y árabes de SFSTORE",
      title: "Perfumes para hacer sentir presencia",
      subtitle: "Importados, árabes y decants para probar antes de comprar.",
      primaryCtaLabel: "Ver perfumes",
      primaryCtaHref: "/perfumes",
      secondaryCtaLabel: "Consultar",
      secondaryCtaHref: generalWhatsAppLink,
    },
    {
      imageSrc: "/home-banner-mates.png",
      imageAlt: "Mates, termos y accesorios de SFSTORE",
      title: "Todo para tu mate",
      subtitle: "Mates, termos y regalos personalizados.",
      primaryCtaLabel: "Ver mates",
      primaryCtaHref: "/mates",
      secondaryCtaLabel: "Pedir recomendación",
      secondaryCtaHref: generalWhatsAppLink,
    },
  ];

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />

      <HomeHeroSlider slides={heroSlides} />


      <section className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-8">
        <div className="grid gap-4 md:grid-cols-3">
          {benefits.map((benefit) => (
            <BenefitCard key={benefit.title} benefit={benefit} />
          ))}
        </div>
      </section>

      <section id="productos" className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              Destacados
            </p>
            <h2 className="mt-3 break-words text-3xl font-semibold text-[#102033] sm:text-4xl">
              Productos para mirar primero
            </h2>
          </div>
          <p className="max-w-md break-words text-sm leading-6 text-[#102033]/65">
            Una selección rápida para regalar, probar o llevar algo distinto.
          </p>
        </div>

        {featuredProducts.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <article
                key={product.id}
                className="flex min-h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-[#003B73]/15 bg-white/70 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#102033]/10"
              >
                <a href={`/producto/${product.slug}`} className="block min-w-0">
                  <ProductVisual
                    product={product}
                    label={getCategoryLabel(product)}
                    className="aspect-[4/3] rounded-b-none"
                  />
                </a>
                <div className="flex min-w-0 flex-1 flex-col justify-between p-5 sm:p-6">
                  <div className="min-w-0">
                    <span className="rounded-full bg-[#0072CE]/10 px-3 py-1 text-xs font-semibold text-[#0072CE]">
                      {getCategoryLabel(product)}
                    </span>
                    <h3 className="mt-5 line-clamp-2 break-words text-2xl font-semibold text-[#102033]">
                      {product.name}
                    </h3>
                    <p className="mt-4 line-clamp-3 break-words text-sm leading-6 text-[#102033]/65">
                      {product.shortDescription}
                    </p>
                  </div>
                  <div className="mt-7 flex min-w-0 flex-col gap-4 border-t border-[#003B73]/15 pt-5">
                    <SimplePrice product={product} />
                    <a
                      href={`/producto/${product.slug}`}
                      className="rounded-full bg-[#102033] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#0072CE]"
                    >
                      Ver producto
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-[#003B73]/15 bg-white/65 p-8 text-center">
            <p className="break-words text-sm leading-6 text-[#102033]/65">
              La vidriera está lista para recibir productos. Mientras tanto, podés explorar perfumes y mates o consultarnos por WhatsApp.
            </p>
          </div>
        )}
      </section>

      <section id="explorar" className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
            Categorías principales
          </p>
          <h2 className="mt-3 break-words text-3xl font-semibold sm:text-4xl">
            Elegí por lo que estás buscando
          </h2>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <CategoryCard
            href="/perfumes"
            eyebrow="Perfumes"
            title="Aromas con presencia"
            description="Aromas dulces, frescos, intensos y elegantes."
            product={perfumeVisual}
            tone="olive"
          />
          <CategoryCard
            href="/mates"
            eyebrow="Mates y termos"
            title="Para tu ritual"
            description="Para disfrutar todos los días o regalar bien."
            product={mateVisual}
            tone="leather"
          />
          <CategoryCard
            href={giftWhatsAppLink}
            eyebrow="Regalos"
            title="Sin dar vueltas"
            description="Opciones para quedar bien sin comprar a ciegas."
            product={featuredProducts[2] ?? featuredProducts[0] ?? perfumeVisual}
            tone="cream"
            isExternal
          />
          <CategoryCard
            href={generalWhatsAppLink}
            eyebrow="Accesorios"
            title="Completá la compra"
            description="Detalles útiles para sumar a tu pedido."
            product={null}
            tone="dark"
            isExternal
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="grid gap-8 rounded-[2rem] border border-[#003B73]/15 bg-white/60 p-6 shadow-sm sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              Venta guiada
            </p>
            <h2 className="mt-3 break-words text-3xl font-semibold sm:text-4xl">
              Te ayudamos a elegir
            </h2>
            <p className="mt-4 break-words text-sm leading-6 text-[#102033]/65">
              Contanos qué buscás y te recomendamos opciones concretas.
            </p>
            <a
              href={generalWhatsAppLink}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex rounded-full bg-[#0072CE] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#003B73]"
            >
              Consultar por WhatsApp
            </a>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <GuideCard
              label="Gustos"
              title="Según tu estilo"
              description="Dulce, fresco, intenso, sobrio o llamativo: afinamos la búsqueda."
            />
            <GuideCard
              label="Presupuesto"
              title="Sin comprar a ciegas"
              description="Probá antes con decants y elegí mejor antes del frasco grande."
            />
            <GuideCard
              label="Ocasión"
              title="Regalos con presencia"
              description="Armamos opciones lindas, útiles y fáciles de entregar."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-4 sm:px-8 lg:pb-24">
        <div className="grid gap-6 overflow-hidden rounded-[2rem] bg-[#102033] p-6 text-white shadow-2xl shadow-[#102033]/10 sm:p-8 lg:grid-cols-[1fr_0.75fr] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#DCE3EA]">
              Regalos que no fallan
            </p>
            <h2 className="mt-3 break-words text-3xl font-semibold sm:text-4xl">
              Perfume, mate o combo pensado para quedar bien
            </h2>
            <p className="mt-4 max-w-2xl break-words text-sm leading-6 text-white/70">
              Contanos para quién es, qué presupuesto tenés y si buscás algo clásico, llamativo o útil. Te pasamos opciones concretas.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <a
              href={giftWhatsAppLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#F7F9FC] px-6 py-3 text-center text-sm font-semibold text-[#102033] transition hover:bg-[#DCE3EA]"
            >
              Pedinos ayuda para armarlo
            </a>
            <a
              href="/perfumes"
              className="rounded-full border border-[#F7F9FC]/25 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#F7F9FC]/10"
            >
              Ver perfumes para regalar
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}




