import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { ProductForm } from "@/components/admin/products/product-form";
import { requireAdminSession } from "@/lib/admin-session";
import { getAdminCategories, getAdminProductById } from "@/services/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {parseComponentPublicationSlug,componentPublicationName} from "@/lib/products/component-combos";
import { updateProduct, updateComponentGallery } from "../../actions";

type EditProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  await requireAdminSession();
  const { id: editorId } = await params;
  const publication=parseComponentPublicationSlug(editorId);
  const id=publication?.presentationId??editorId;
  const [categoriesResult, productResult] = await Promise.all([
    getAdminCategories(),
    getAdminProductById(id),
  ]);
  let product = productResult.data;
  const { data: recipe, error: recipeError } = await getSupabaseAdminClient().from("component_recipes").select("id").eq("presentation_product", id).maybeSingle();
  if (recipeError) throw new Error("No se pudo verificar la presentación del producto.");
  if(publication&&!recipe)notFound();
  if(recipe&&!publication)redirect("/admin/productos");
  const connector=publication?.connector;
  if (product && connector) product = { ...product,name:componentPublicationName(connector), product_images: product.product_images?.filter(image => image.combo_connector === connector) };


  if (!product && !productResult.error) {
    notFound();
  }

  const categories = categoriesResult.data ?? [];

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
          Productos
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Editar producto</h1>
        {categoriesResult.error || productResult.error ? (
          <div className="mt-8 rounded-3xl border border-[#8B5E3C]/20 bg-white/70 p-5 text-sm font-semibold text-[#8B5E3C]">
            {categoriesResult.error ?? productResult.error}
          </div>
        ) : null}
        {connector ? <p className="mt-4 text-xl font-semibold">{product?.name}</p> : null}
        {product?.family_id ? <p className="mt-5 rounded-xl border border-[#8B5E3C]/20 p-4">El precio y la combinación se administran en <Link className="underline" href={`/admin/productos/familias/${product.family_id}`}>la familia del SKU</Link>. El precio y SKU no se editan aquí; podés administrar sus fotografías y otros datos.</p> : null}
        {product ? (
          <ProductForm
            key={`${id}:${connector ?? "simple"}`}
            action={connector ? updateComponentGallery : updateProduct}
            connector={connector}
            categories={categories}
            product={product}
            submitLabel="Guardar cambios"
          />
        ) : null}
      </section>
    </main>
  );
}
