import { CatalogFrame, catalogStyles } from "@/components/catalog/catalog-frame";
import { ProductGrid } from "@/components/product-grid";
import { getProductsByCategorySlug } from "@/services/products";
import { connection } from "next/server";
import { availableFirst } from "@/lib/catalog/availability-order";

export const metadata = { title: "Accesorios", description: "Cabezales, cables y cargadores completos. Elegí el conector de tu equipo." };

export default async function AccessoriesPage() {
  await connection(); // Read current stock/catalog at request time, never freeze a build snapshot.
  const products = await getProductsByCategorySlug("accesorios");
  return <CatalogFrame>
    <section className="storefront-catalog mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <h1 className={`${catalogStyles.title} catalog-title`}>Accesorios</h1>
      <p className={`${catalogStyles.lead} mt-3 text-sm`}>Cabezales y cables por separado o cargadores completos. Revisá el conector antes de elegir.</p>
      <ProductGrid products={availableFirst(products)} label="Accesorios" />
    </section></CatalogFrame>;
}
