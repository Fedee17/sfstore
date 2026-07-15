import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { ProductForm } from "@/components/admin/products/product-form";
import { requireAdminSession } from "@/lib/admin-session";
import { getAdminCategories, getAdminProductById } from "@/services/admin";
import { updateProduct } from "../../actions";

type EditProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  await requireAdminSession();
  const { id } = await params;
  const [categoriesResult, productResult] = await Promise.all([
    getAdminCategories(),
    getAdminProductById(id),
  ]);
  const product = productResult.data;

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
        {product ? (
          <ProductForm
            action={updateProduct}
            categories={categories}
            product={product}
            submitLabel="Guardar cambios"
          />
        ) : null}
      </section>
    </main>
  );
}
