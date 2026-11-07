import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { HomeProductCarousel } from "./home-product-card";
import { HomeHeroSlider, type HomeHeroSlide } from "@/components/home-hero-slider";
import { SiteHeader } from "@/components/site-header";
import { getHomeCardPricing } from "@/lib/catalog/home-card-presentation";
import { getHomeFeaturedProducts } from "@/lib/catalog/home-selection";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getCatalogPublications } from "@/services/products";
import { RitualMatero } from "./ritual-matero";
import { availableFirst } from "@/lib/catalog/availability-order";
import categoryStyles from "./home-category.module.css";
import featuredStyles from "./home-featured.module.css";

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

function CategoryCard({ href, title, description, imageSrc }: {
  href: string; title: string; description: string; imageSrc: string;
}) {
  return (
    <Link href={href} className={categoryStyles.photoCard}>
      <img src={imageSrc} alt="" width={1080} height={608} loading="lazy" decoding="async" className={categoryStyles.photo} />
      <div className={categoryStyles.copy}>
        <h3>{title}</h3>
        <p>{description}</p>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={categoryStyles.arrow}>
          <path d="M4 12h16m-6-6 6 6-6 6" />
        </svg>
      </div>
    </Link>
  );
}

const readHomeCatalog = cache(async () => {
  await connection();
  return getCatalogPublications();
});

async function FeaturedProducts() {
  const featuredProducts = getHomeFeaturedProducts(await readHomeCatalog()).sort((a, b) =>
    (getHomeCardPricing(b)?.special ?? 0) - (getHomeCardPricing(a)?.special ?? 0)
  );
  if (!featuredProducts.length) return null;

  return (
    <>
      <h2 id="home-featured-title" className={featuredStyles.title}><strong>LOS MÁS ELEGIDOS</strong> DE SF STORE</h2>
      <HomeProductCarousel products={featuredProducts} />
    </>
  );
}

async function HomeRitualMatero() {
  const products = (await readHomeCatalog()).filter((product) => product.category === "mates");
  const groups = [
    { label: "Mates", slugs: ["mates"] },
    { label: "Termos", slugs: ["termos"] },
    { label: "Bombillas y Bombillones", slugs: ["bombillas", "bombillones"] },
    { label: "Yerbas", slugs: ["yerbas"] },
  ].map(({ label, slugs }) => ({
    label,
    products: availableFirst(products.filter((product) => slugs.includes(product.categorySlug ?? product.category))).slice(0, 8),
  }));
  return <RitualMatero groups={groups} />;
}

export default function Home() {

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
      imageSrcSet: "/home/femenino-desktop-960.webp 960w, /home/femenino-desktop-1200.webp 1200w, /home/femenino-desktop-1600.webp 1600w",
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
      imageSrcSet: "/home/masculino-desktop-960.webp 960w, /home/masculino-desktop-1200.webp 1200w, /home/masculino-desktop-1600.webp 1600w",
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
        <h2 id="explore-title" className={featuredStyles.sectionTitle}>¿Qué estás buscando?</h2>
        <div className={categoryStyles.grid}>
          <CategoryCard href="/perfumes" title="Perfumes árabes" description="Encontrá tu próxima fragancia." imageSrc="/home/category-perfumes.webp" />
          <CategoryCard href="/mates" title="Mates" description="Tradición en cada cebada" imageSrc="/home/category-mates.webp" />
          <CategoryCard href="/mates?categoria=termos" title="Termos" description="Compañeros en cada aventura" imageSrc="/home/category-termos.webp" />
          <CategoryCard href="/mates" title="Accesorios materos" description="Todo para acompañar tu ritual" imageSrc="/home/category-accesorios.webp" />
        </div>
      </section>

      <section id="productos" aria-labelledby="home-featured-title" className={`${featuredStyles.section} mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-10`}>
        <Suspense fallback={<div className={featuredStyles.loading} aria-hidden="true" />}>
          <FeaturedProducts />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <HomeRitualMatero />
      </Suspense>

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




