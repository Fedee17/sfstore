import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { PurchaseDraftForm } from "@/components/admin/purchases/purchase-draft-form";
import { requireAdminSession } from "@/lib/admin-session";
import { getAdminCategories } from "@/services/admin";
import {
  getPurchaseById,
  listActiveSuppliers,
  listPurchaseProducts,
} from "@/services/purchases";

type EditPurchasePageProps = { params: Promise<{ id: string }> };

export default async function EditPurchasePage({ params }: EditPurchasePageProps) {
  await requireAdminSession();
  const { id } = await params;
  const [purchase, suppliers, products, categoriesResult] = await Promise.all([
    getPurchaseById(id),
    listActiveSuppliers(),
    listPurchaseProducts(),
    getAdminCategories(),
  ]);

  if (!purchase) {
    notFound();
  }

  if (purchase.status !== "draft") {
    redirect(`/admin/compras/${purchase.id}`);
  }

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Link href={`/admin/compras/${purchase.id}`} className="text-sm font-semibold text-[#8B5E3C]">Volver al detalle</Link>
        <h1 className="mt-4 text-4xl font-semibold">Editar borrador</h1>
        <p className="mt-2 text-sm text-[#1F1F1F]/60">Los totales se recalculan en el servidor al guardar.</p>
        <PurchaseDraftForm
          suppliers={suppliers}
          products={products}
          categories={(categoriesResult.data ?? []).filter(
            (category) => category.is_active,
          )}
          purchase={purchase}
        />
      </section>
    </main>
  );
}
