import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { SupplierStatusForm } from "@/components/admin/suppliers/supplier-status-form";
import { requireAdminSession } from "@/lib/admin-session";
import {
  getSupplierById,
  getSupplierPurchaseSummary,
} from "@/services/suppliers";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" });
const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const statusLabels = {
  draft: "Borrador",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};

type SupplierDetailPageProps = { params: Promise<{ id: string }> };

export default async function SupplierDetailPage({ params }: SupplierDetailPageProps) {
  await requireAdminSession();
  const { id } = await params;
  const [supplier, purchaseData] = await Promise.all([
    getSupplierById(id),
    getSupplierPurchaseSummary(id),
  ]);

  if (!supplier) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Link href="/admin/proveedores" className="text-sm font-semibold text-[#8B5E3C]">Volver a proveedores</Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${supplier.is_active ? "bg-[#556B2F]/10 text-[#556B2F]" : "bg-[#1F1F1F]/10 text-[#1F1F1F]/60"}`}>{supplier.is_active ? "Activo" : "Inactivo"}</span>
            <h1 className="mt-3 break-words text-4xl font-semibold">{supplier.name}</h1>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">Registrado el {dateTimeFormatter.format(new Date(supplier.created_at))}</p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Link href={`/admin/proveedores/${supplier.id}/editar`} className="rounded-full border border-[#556B2F]/30 px-5 py-3 text-sm font-semibold text-[#556B2F] transition hover:bg-[#556B2F]/10">Editar</Link>
            <SupplierStatusForm supplierId={supplier.id} isActive={supplier.is_active} />
          </div>
        </div>

        <section className="mt-8 grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-6 shadow-sm sm:grid-cols-2">
          <Info label="Contacto" value={supplier.contact_name} />
          <Info label="Email" value={supplier.email} />
          <Info label="Telefono" value={supplier.phone} />
          <Info label="WhatsApp" value={supplier.whatsapp} />
          <Info label="Direccion" value={supplier.address} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">Website</p>
            {supplier.website ? <Link href={supplier.website} target="_blank" rel="noreferrer" className="mt-1 block break-all font-medium text-[#556B2F] underline">{supplier.website}</Link> : <p className="mt-1 text-[#1F1F1F]/45">Sin datos</p>}
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">Notas</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#1F1F1F]/70">{supplier.notes || "Sin notas"}</p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-4">
          <Metric label="Compras registradas" value={String(purchaseData.summary.purchaseCount)} />
          <Metric label="Compras confirmadas" value={String(purchaseData.summary.confirmedPurchaseCount)} />
          <Metric label="Total confirmado" value={currencyFormatter.format(purchaseData.summary.totalPurchased)} />
          <Metric label="Unidades confirmadas" value={String(purchaseData.summary.totalUnits)} />
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Compras asociadas</h2>
              <p className="mt-1 text-sm text-[#1F1F1F]/60">Historial ordenado desde la compra más reciente.</p>
            </div>
            {purchaseData.summary.lastPurchaseDate ? <p className="text-sm text-[#1F1F1F]/60">Ultima compra: {dateFormatter.format(new Date(`${purchaseData.summary.lastPurchaseDate}T00:00:00Z`))}</p> : null}
          </div>

          {purchaseData.purchases.length === 0 ? (
            <div className="mt-5 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-6 text-center shadow-sm">Este proveedor todavía no tiene compras.</div>
          ) : (
            <div className="mt-5 grid gap-3">
              {purchaseData.purchases.map((purchase) => (
                <article key={purchase.id} className="grid gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#556B2F]/10 px-3 py-1 text-xs font-semibold text-[#556B2F]">{statusLabels[purchase.status]}</span>
                      <span className="text-xs text-[#1F1F1F]/50">{dateFormatter.format(new Date(`${purchase.purchase_date}T00:00:00Z`))}</span>
                    </div>
                    <p className="mt-2 text-sm text-[#1F1F1F]/70">Subtotal {currencyFormatter.format(Number(purchase.supplier_subtotal))} · Envio {currencyFormatter.format(Number(purchase.shipping_cost))} · Total {currencyFormatter.format(Number(purchase.total_cost))} · {purchase.total_units} unidades</p>
                    <p className="mt-1 text-xs text-[#1F1F1F]/45">Nombre registrado: {purchase.supplier_name_snapshot}</p>
                  </div>
                  <Link href={`/admin/compras/${purchase.id}`} className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#556B2F] hover:text-[#556B2F]">Ver compra</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">{label}</p>
      <p className="mt-1 break-words font-medium">{value || "Sin datos"}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#556B2F]/20 bg-[#556B2F]/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#556B2F]">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold">{value}</p>
    </div>
  );
}
