import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { listPurchases } from "@/services/purchases";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" });

const statusLabels = {
  draft: "Borrador",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};

export default async function AdminPurchasesPage() {
  await requireAdminSession();
  const purchases = await listPurchases();

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">Admin</p>
            <h1 className="mt-3 text-4xl font-semibold">Compras</h1>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">
              Registrá compras a proveedores y confirmalas cuando recibas la mercadería.
            </p>
          </div>
          <Link
            href="/admin/compras/nueva"
            className="rounded-full bg-[#556B2F] px-6 py-3 text-center text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826]"
          >
            Nueva compra
          </Link>
        </div>

        {purchases.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">Todavia no hay compras</h2>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">Crea el primer borrador para comenzar.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {purchases.map((purchase) => (
              <article
                key={purchase.id}
                className="grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#556B2F]/10 px-3 py-1 text-xs font-semibold text-[#556B2F]">
                      {statusLabels[purchase.status]}
                    </span>
                    <span className="text-xs text-[#1F1F1F]/50">
                      {dateFormatter.format(new Date(`${purchase.purchase_date}T00:00:00Z`))}
                    </span>
                  </div>
                  <h2 className="mt-2 break-words text-xl font-semibold">{purchase.supplier_name_snapshot}</h2>
                  <p className="mt-2 text-sm text-[#1F1F1F]/60">
                    {purchase.distinct_product_count ?? 0} productos distintos · {purchase.total_units} unidades · Subtotal {currencyFormatter.format(Number(purchase.supplier_subtotal))} · Envio {currencyFormatter.format(Number(purchase.shipping_cost))} · Total {currencyFormatter.format(Number(purchase.total_cost))}
                  </p>
                </div>
                <Link
                  href={`/admin/compras/${purchase.id}`}
                  className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#556B2F] hover:text-[#556B2F]"
                >
                  Ver detalle
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
