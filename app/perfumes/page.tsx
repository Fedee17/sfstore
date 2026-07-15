import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ProductGrid } from "@/components/product-grid";
import { getProductsByCategorySlug } from "@/services/products";

export const metadata: Metadata = {
  title: "Perfumes importados y Ã¡rabes",
  description:
    "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
  openGraph: {
    title: "Perfumes importados y Ã¡rabes",
    description:
      "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
    url: "/perfumes",
  },
  twitter: {
    title: "Perfumes importados y Ã¡rabes",
    description:
      "Perfumes dulces, frescos, intensos y elegantes. Te ayudamos a elegir el aroma ideal para vos o para regalar.",
  },
};

export default async function PerfumesPage() {
  const products = await getProductsByCategorySlug("perfumes");

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
        <div className="mt-10 flex min-w-0 flex-col justify-between gap-6 overflow-hidden rounded-[2rem] border border-[#003B73]/15 bg-white/55 p-6 shadow-sm md:flex-row md:items-end sm:p-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              CatÃ¡logo
            </p>
            <h1 className="mt-3 break-words text-4xl font-semibold leading-tight sm:text-5xl">
              Perfumes importados
            </h1>
            <p className="mt-4 max-w-2xl break-words text-sm leading-6 text-[#0072CE]">
              Precio especial por efectivo/transferencia cuando el producto lo tenga disponible.
            </p>
          </div>
          <p className="max-w-xl break-words text-base leading-7 text-[#102033]/70">
            Aromas dulces, frescos e intensos para regalar bien o hacer sentir presencia. Te ayudamos a elegir.
          </p>
        </div>

        <ProductGrid products={products} label="Perfume" />
      </section>
    </main>
  );
}

