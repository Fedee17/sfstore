import Link from "next/link";

import { createSupplierAction } from "@/app/admin/compras/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { PurchaseDraftForm } from "@/components/admin/purchases/purchase-draft-form";
import { requireAdminSession } from "@/lib/admin-session";
import {
  listActiveSuppliers,
  listPurchaseProducts,
} from "@/services/purchases";

type NewPurchasePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewPurchasePage({ searchParams }: NewPurchasePageProps) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  const [suppliers, products] = await Promise.all([
    listActiveSuppliers(),
    listPurchaseProducts(),
  ]);

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Link href="/admin/compras" className="text-sm font-semibold text-[#8B5E3C]">
          Volver a compras
        </Link>
        <h1 className="mt-4 text-4xl font-semibold">Nueva compra</h1>
        <p className="mt-2 text-sm text-[#1F1F1F]/60">
          Se guardara como borrador, sin modificar stock ni costos del catalogo.
        </p>

        <details
          open={suppliers.length === 0}
          className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm"
        >
          <summary className="cursor-pointer font-semibold text-[#8B5E3C]">Agregar proveedor</summary>
          {params.supplierCreated ? (
            <p role="status" className="mt-3 text-sm font-semibold text-[#556B2F]">Proveedor creado.</p>
          ) : null}
          <form action={createSupplierAction} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <label className="grid min-w-0 gap-2 text-sm font-semibold">
              Nombre
              <input name="name" required className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-semibold">
              Notas
              <input name="notes" className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
            </label>
            <PendingSubmitButton
              pendingLabel="Creando..."
              className="h-12 rounded-2xl border border-[#556B2F]/30 px-5 text-sm font-semibold text-[#556B2F] transition hover:bg-[#556B2F]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Crear proveedor
            </PendingSubmitButton>
          </form>
        </details>

        <PurchaseDraftForm suppliers={suppliers} products={products} />
      </section>
    </main>
  );
}
