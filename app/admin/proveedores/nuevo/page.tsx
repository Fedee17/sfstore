import Link from "next/link";

import { createSupplierAdminAction } from "@/app/admin/proveedores/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { SupplierForm } from "@/components/admin/suppliers/supplier-form";
import { requireAdminSession } from "@/lib/admin-session";

export default async function NewSupplierPage() {
  await requireAdminSession();

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <Link href="/admin/proveedores" className="text-sm font-semibold text-[#8B5E3C]">Volver a proveedores</Link>
        <h1 className="mt-4 text-4xl font-semibold">Nuevo proveedor</h1>
        <p className="mt-2 text-sm text-[#1F1F1F]/60">Solo el nombre es obligatorio. Podés completar los datos de contacto ahora o más adelante.</p>
        <SupplierForm action={createSupplierAdminAction} />
      </section>
    </main>
  );
}
