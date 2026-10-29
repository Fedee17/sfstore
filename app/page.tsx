import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { HomeHeroSlider, type HomeHeroSlide } from "@/components/home-hero-slider";
import { SiteHeader } from "@/components/site-header";
import { getWebTransferPrice, hasValidWebPrice } from "@/lib/web-transfer-pricing";
import { getHomeFeaturedProducts } from "@/lib/catalog/home-selection";
import { publicationAvailable } from "@/lib/products/public-families";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getCatalogPublications, type PublicProduct } from "@/services/products";
import categoryStyles from "./home-category.module.css";

export const metadata: Metadata = {
  title: "Perfumes árabes, mates y regalos",
  description:
    "Elegí perfumes árabes, mates, termos y regalos con ayuda personalizada. Comprá online o consultá por WhatsApp.",
  openGraph: {
    title: "Perfumes árabes, mates y regalos",
    description:
      "Elegí perfumes árabes, mates, termos y regalos con ayuda personalizada. Comprá online o consultá por WhatsApp.",
    url: "/",
  },
  twitter: {
    title: "Perfumes árabes, mates y regalos",
    description:
      "Elegí perfumes árabes, mates, termos y regalos con ayuda personalizada. Comprá online o consultá por WhatsApp.",
  },
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const categoryLabels: Record<PublicProduct["category"], string> = {
  perfumes: "Perfumes",
  mates: "Mates y termos",
  accesorios: "Accesorios",
};

const benefits = [
  {
    title: "Enviamos tu compra",
    description: "Entregas a todo el país",
    icon: "shipping",
  },
  {
    title: "Pago por transferencia",
    description: "25% de descuento. Pago del 100%.",
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
      <div className={`relative min-w-0 overflow-hidden rounded-[1.5rem] bg-white ${className}`}>
        <img
          src={product.primaryImageUrl}
          alt={product.primaryImageAlt ?? product.name}
          loading={loading}
          className="absolute inset-0 h-full w-full object-contain"
        />

      </div>
    );
  }

  return (
    <div role="img" aria-label={`Imagen no disponible de ${product?.name ?? label}`} className={`flex min-w-0 items-center justify-center overflow-hidden rounded-[1.5rem] border border-[#003B73]/15 bg-[#F7F9FC] text-2xl font-semibold text-[#003B73] ${className}`}>
      <span aria-hidden="true">{product?.imagePlaceholder ?? "SF"}</span>
    </div>
  );
}

function SimplePrice({ product }: { product: PublicProduct }) {
  if (!hasValidWebPrice(product.price)) return <p className="text-sm font-semibold text-[#003B73]">Precio a confirmar</p>;
  const price = getWebTransferPrice(product.price);

  return (
    <div>
      <p className="text-xs font-semibold text-[#003B73]">
        Transferencia bancaria
      </p>
      <p className="mt-1 break-words text-lg font-semibold text-[#102033] sm:text-2xl">
        {formatCurrency(price)}
      </p>
    </div>
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
    <article className="flex min-w-0 gap-3 rounded-2xl border border-[#003B73]/15 bg-white/75 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#0072CE]/10 text-[#0072CE]">
        <BenefitIcon type={benefit.icon} />
      </div>
      <div className="min-w-0">
        <h3 className="break-words text-base font-semibold text-[#102033]">
          {benefit.title}
        </h3>
        <p className="mt-1 break-words text-xs leading-5 text-[#526479]">
          {benefit.description}
        </p>
      </div>
    </article>
  );
}

function CategoryCard({ href, title, description, product, imageSrc, imageClassName, tallMobile = false }: {
  href: string; title: string; description: string; product?: PublicProduct | null; imageSrc?: string; imageClassName?: string; tallMobile?: boolean;
}) {
  if (imageSrc) {
    return (
      <Link href={href} className={`${categoryStyles.photoCard}${tallMobile ? ` ${categoryStyles.tallMobileCard}` : ""} group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]`}>
        <img src={imageSrc} alt="" width={1670} height={942} loading="lazy" className={`${categoryStyles.photo}${imageClassName ? ` ${imageClassName}` : ""}`} />
        <span aria-hidden="true" className={categoryStyles.shade} />
        <div className={categoryStyles.copy}>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={categoryStyles.arrow}>
          <path d="M4 12h16m-6-6 6 6-6 6" />
        </svg>
      </Link>
    );
  }
  return (
    <Link href={href} className="group grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-4 overflow-hidden rounded-3xl border border-[#003B73]/15 bg-white/75 p-3 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE] sm:grid-cols-1 sm:p-4">
      <ProductVisual product={product} label={title} className="aspect-square sm:aspect-[4/3]" />
      <div className="min-w-0 sm:px-1 sm:pb-1">
        <h3 className="text-lg font-semibold text-[#102033] sm:text-xl">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[#526479]">{description}</p>
      </div>
    </Link>
  );
}

export default async function Home() {
  await connection(); // Current catalog/stock at request time, never frozen during build.
  const allProducts = await getCatalogPublications();
  const featuredProducts = getHomeFeaturedProducts(allProducts);
  const giftWhatsAppLink = buildWhatsAppUrl(
    "Hola SFSTORE, quiero armar un regalo y necesito ayuda para elegir.",
  );
  const generalWhatsAppLink = buildWhatsAppUrl(
    "Hola SFSTORE, quiero hacer una consulta desde la web.",
  );
  const heroSlides: HomeHeroSlide[] = [
    {
      composition: "continuous",
      imageSrc: "/home/femenino-desktop-1600.webp",
      imageSrcSet: "/home/femenino-desktop-960.webp 960w, /home/femenino-desktop-1600.webp 1600w",
      mobileImageSrc: "/home/femenino-mobile-768.webp",
      mobileImageSrcSet: "/home/femenino-mobile-480.webp 480w, /home/femenino-mobile-768.webp 768w",
      imageAlt: "Perfumes árabes para mujer",
      title: "Un perfume que habla de vos.",
      subtitle: "Descubrí nuestra selección de perfumes árabes para mujer.",
      primaryCtaLabel: "Ver perfumes árabes",
      primaryCtaHref: "/perfumes?categoria=arabe&genero=femenino",
    },
    {
      composition: "continuous",
      desktopImagePosition: "85% center",
      imageSrc: "/home/masculino-desktop-1600.webp",
      imageSrcSet: "/home/masculino-desktop-960.webp 960w, /home/masculino-desktop-1600.webp 1600w",
      mobileImageSrc: "/home/masculino-mobile-768.webp",
      mobileImageSrcSet: "/home/masculino-mobile-480.webp 480w, /home/masculino-mobile-768.webp 768w",
      imageAlt: "Perfumes árabes para hombre",
      title: "Perfumes para hacer sentir presencia.",
      subtitle: "Descubrí nuestra selección de perfumes árabes para hombre.",
      primaryCtaLabel: "Ver perfumes árabes",
      primaryCtaHref: "/perfumes?categoria=arabe&genero=masculino",
    },
  ];

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />

      <h1 className="sr-only">Perfumes árabes, mates y regalos</h1>

      <HomeHeroSlider slides={heroSlides} />


      <section className="mx-auto max-w-6xl px-5 py-3 sm:px-8 lg:py-4">
        <div className="grid gap-2 md:grid-cols-3">
          {benefits.map((benefit) => (
            <BenefitCard key={benefit.title} benefit={benefit} />
          ))}
        </div>
      </section>

      <section id="explorar" className="mx-auto max-w-6xl px-5 py-5 sm:px-8 lg:py-8" aria-labelledby="explore-title">
        <h2 id="explore-title" className="text-2xl font-semibold sm:text-3xl">¿Qué estás buscando?</h2>
        <div className={categoryStyles.grid}>
          <CategoryCard href="/perfumes" title="Perfumes árabes" description="Encontrá tu próxima fragancia." imageSrc="/home/a_wide_cinematic_high_resolution_tropical_sunset.png" />
          <CategoryCard href="/mates" title="Mates" description="Tradición en cada cebada" imageSrc="/home/a_wide_cinematic_photorealistic_still_life_scene.png" imageClassName={categoryStyles.threeMatesPhoto} tallMobile />
          <CategoryCard href="/mates?categoria=termos" title="Termos" description="Compañeros en cada aventura" imageSrc="/home/outdoor_sunset_landscape_product_photo_a_warm_gol.png" imageClassName={categoryStyles.thermosPhoto} tallMobile />
          <CategoryCard href="/mates" title="Accesorios materos" description="Todo para acompañar tu ritual" imageSrc="/home/wide_cozy_warm_toned_photorealistic_product_sti.png" imageClassName={categoryStyles.mateAccessoriesPhoto} tallMobile />
        </div>
      </section>

      <section id="productos" className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-10">
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
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
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
                <div className="flex min-w-0 flex-1 flex-col justify-between p-3 sm:p-5">
                  <div className="min-w-0">
                    <span className="rounded-full bg-[#0072CE]/10 px-3 py-1 text-xs font-semibold text-[#0072CE]">
                      {getCategoryLabel(product)}
                    </span>
                    <h3 className="mt-3 line-clamp-2 break-words text-base sm:text-xl font-semibold text-[#102033]">
                      {product.name}
                    </h3>
                    <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-[#102033]/65">
                      {product.shortDescription}
                    </p>
                  </div>
                  <div className="mt-4 flex min-w-0 flex-col gap-4 border-t border-[#003B73]/15 pt-3">
                    <p className="text-xs font-semibold text-[#526479]">{publicationAvailable(product) ? "En stock" : "Agotado · consultar"}</p>
                    <SimplePrice product={product} />
                    <a
                      href={`/producto/${product.slug}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#102033] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#0072CE]"
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

      <section id="regalos" className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-10" aria-labelledby="gifts-title">
        <div className="rounded-[2rem] border border-[#003B73]/15 bg-white/70 p-5 sm:p-7">
          <h2 id="gifts-title" className="text-2xl font-semibold sm:text-3xl">Elegí un regalo a tu manera</h2>
          <p className="mt-3 text-sm leading-6 text-[#526479]">Explorá opciones o pedinos ayuda para elegir según sus gustos y tu presupuesto.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/perfumes" className="inline-flex min-h-11 items-center rounded-full border border-[#003B73]/30 px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">Ver perfumes para regalar</Link>
            <Link href="/mates" className="inline-flex min-h-11 items-center rounded-full border border-[#003B73]/30 px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">Ver mates para regalar</Link>
            <Link href="/accesorios" className="inline-flex min-h-11 items-center rounded-full border border-[#003B73]/30 px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">Ver accesorios y cargadores</Link>
            <a href={giftWhatsAppLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-[#0072CE] px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">Consultar regalos<span className="sr-only"> por WhatsApp, abre una pestaña nueva</span></a>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#526479]">«Consultar regalos» abre WhatsApp en una pestaña nueva.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-4 sm:px-8" aria-labelledby="advice-title">
        <div className="flex flex-col gap-4 rounded-3xl bg-[#102033] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div><h2 id="advice-title" className="text-xl font-semibold">¿No sabés qué elegir?</h2><p className="mt-2 text-sm text-white/85">Te asesoramos por WhatsApp.</p></div>
          <a href={generalWhatsAppLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#102033] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Consultar por WhatsApp<span className="sr-only">, abre una pestaña nueva</span></a>
        </div>
      </section>
    </main>
  );
}




