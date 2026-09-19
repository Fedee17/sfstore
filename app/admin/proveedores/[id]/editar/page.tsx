import Link from "next/link";
import { notFound } from "next/navigation";

import { updateSupplierAdminAction } from "@/app/admin/proveedores/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { SupplierForm } from "@/components/admin/suppliers/supplier-form";
import { requireAdminSession } from "@/lib/admin-session";
import { getSupplierById } from "@/services/suppliers";

type EditSupplierPageProps = { params: Promise<{ id: string }> };

export default async function EditSupplierPage({ params }: EditSupplierPageProps) {
  await requireAdminSession();
  const { id } = await params;
  const supplier = await getSupplierById(id);

  if (!supplier) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <Link href={`/admin/proveedores/${supplier.id}`} className="text-sm font-semibold text-[#8B5E3C]">Volver al proveedor</Link>
        <h1 className="mt-4 text-4xl font-semibold">Editar proveedor</h1>
        <p className="mt-2 text-sm text-[#1F1F1F]/60">Los cambios de nombre no modifican los snapshots de compras anteriores.</p>
        <SupplierForm action={updateSupplierAdminAction} supplier={supplier} />
      </section>
    </main>
  );
}
