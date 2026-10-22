import { SiteHeader } from "@/components/site-header";
import { ProductGrid } from "@/components/product-grid";
import { getProductsByCategorySlug } from "@/services/products";
import { connection } from "next/server";

export const metadata = { title: "Accesorios", description: "Cabezales, cables y cargadores completos. Elegí el conector de tu equipo." };

export default async function AccessoriesPage() {
  await connection(); // Read current stock/catalog at request time, never freeze a build snapshot.
  const products = await getProductsByCategorySlug("accesorios");
  return <main className="min-h-screen bg-[#F7F9FC] text-[#102033]"><SiteHeader />
    <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <h1 className="text-3xl font-semibold">Accesorios</h1>
      <p className="mt-3 text-sm">Cabezales y cables por separado o cargadores completos. Revisá el conector antes de elegir.</p>
      <ProductGrid products={products} label="Accesorios" />
    </section></main>;
}
