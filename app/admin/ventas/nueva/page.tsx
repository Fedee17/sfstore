import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { StoreSaleForm } from "@/components/admin/sales/store-sale-form";
import { requireAdminSession } from "@/lib/admin-session";
import { listStoreSaleProducts } from "@/services/store-sales";

export default async function NewStoreSalePage() {
  await requireAdminSession();
  const products = await listStoreSaleProducts();

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Link href="/admin/ventas" className="text-sm font-semibold text-[#8B5E3C]">Volver a ventas</Link>
        <h1 className="mt-4 text-4xl font-semibold">Nueva venta local</h1>
        <p className="mt-2 text-sm text-[#1F1F1F]/60">El stock se descuenta recien cuando el pago queda completo.</p>
        <StoreSaleForm products={products} />
      </section>
    </main>
  );
}
