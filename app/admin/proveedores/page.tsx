import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { listSuppliers } from "@/services/suppliers";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" });

type SuppliersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  const search = firstParam(params.q);
  const activeParam = firstParam(params.active);
  const active = activeParam === "active" || activeParam === "inactive" ? activeParam : "all";
  const suppliers = await listSuppliers({ search, active });

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">Admin</p>
            <h1 className="mt-3 text-4xl font-semibold">Proveedores</h1>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">Contactos, estado y compras asociadas.</p>
          </div>
          <Link href="/admin/proveedores/nuevo" className="rounded-full bg-[#556B2F] px-6 py-3 text-center text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826]">Nuevo proveedor</Link>
        </div>

        <form method="get" className="mt-8 grid gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)_auto] sm:items-end">
          <label className="grid gap-2 text-sm font-semibold">
            Buscar por nombre
            <input name="q" defaultValue={search} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Estado
            <select name="active" defaultValue={active} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]">
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </label>
          <button type="submit" className="h-12 rounded-2xl border border-[#556B2F]/30 px-5 text-sm font-semibold text-[#556B2F] transition hover:bg-[#556B2F]/10">Filtrar</button>
        </form>

        {suppliers.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">No hay proveedores para mostrar</h2>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">Ajustá los filtros o registrá un proveedor nuevo.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {suppliers.map((supplier) => (
              <article key={supplier.id} className="grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${supplier.is_active ? "bg-[#556B2F]/10 text-[#556B2F]" : "bg-[#1F1F1F]/10 text-[#1F1F1F]/60"}`}>{supplier.is_active ? "Activo" : "Inactivo"}</span>
                    {supplier.lastPurchaseDate ? <span className="text-xs text-[#1F1F1F]/50">Ultima compra {dateFormatter.format(new Date(`${supplier.lastPurchaseDate}T00:00:00Z`))}</span> : null}
                  </div>
                  <h2 className="mt-2 break-words text-xl font-semibold">{supplier.name}</h2>
                  {supplier.contact_name || supplier.whatsapp || supplier.phone ? (
                    <p className="mt-1 text-sm text-[#1F1F1F]/60">{[supplier.contact_name, supplier.whatsapp ? `WhatsApp ${supplier.whatsapp}` : supplier.phone].filter(Boolean).join(" · ")}</p>
                  ) : null}
                  <p className="mt-2 text-sm text-[#1F1F1F]/60">{supplier.purchaseCount} compras registradas · {supplier.confirmedPurchaseCount} confirmadas · Total confirmado {currencyFormatter.format(supplier.totalPurchased)}</p>
                </div>
                <Link href={`/admin/proveedores/${supplier.id}`} className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#556B2F] hover:text-[#556B2F]">Ver detalle</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
