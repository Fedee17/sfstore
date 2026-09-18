import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { listStoreSales } from "@/services/store-sales";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

const paymentLabels: Record<string, string> = {
  pending: "Pendiente",
  partial: "Pago parcial",
  paid: "Pagada",
  refunded: "Reintegrada",
  rejected: "Rechazada",
};

type SalesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function AdminSalesPage({ searchParams }: SalesPageProps) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  const channelParam = scalar(params.channel);
  const paymentStatus = scalar(params.paymentStatus);
  const date = scalar(params.date);
  const channel = ["web", "store", "order"].includes(channelParam)
    ? (channelParam as "web" | "store" | "order")
    : "store";
  const sales = await listStoreSales({ channel, paymentStatus, date });

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">Admin</p>
            <h1 className="mt-3 text-4xl font-semibold">Ventas</h1>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">Ventas locales, pagos registrados y estado de stock.</p>
          </div>
          <Link href="/admin/ventas/nueva" className="rounded-full bg-[#556B2F] px-6 py-3 text-center text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826]">
            Nueva venta
          </Link>
        </div>

        <form className="mt-8 grid gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm sm:grid-cols-4 sm:items-end">
          <label className="grid gap-2 text-sm font-semibold">
            Canal
            <select name="channel" defaultValue={channel} className="h-11 rounded-xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3">
              <option value="store">Local</option>
              <option value="web">Web</option>
              <option value="order">Pedido</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Pago
            <select name="paymentStatus" defaultValue={paymentStatus} className="h-11 rounded-xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3">
              <option value="">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="partial">Parcial</option>
              <option value="paid">Pagada</option>
              <option value="refunded">Reintegrada</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Fecha
            <input type="date" name="date" defaultValue={date} className="h-11 rounded-xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3" />
          </label>
          <button className="h-11 rounded-xl border border-[#556B2F]/30 px-5 text-sm font-semibold text-[#556B2F] transition hover:bg-[#556B2F]/10">Filtrar</button>
        </form>

        {sales.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">No hay ventas para este filtro</h2>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {sales.map((sale) => (
              <article key={sale.id} className="grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#556B2F]/10 px-3 py-1 text-xs font-semibold text-[#556B2F]">{paymentLabels[sale.payment_status] ?? sale.payment_status}</span>
                    <span className="text-xs text-[#1F1F1F]/50">{sale.channel} · {dateFormatter.format(new Date(sale.created_at))}</span>
                  </div>
                  <h2 className="mt-2 break-words text-xl font-semibold">{sale.displayName}</h2>
                  <p className="mt-1 text-xs text-[#1F1F1F]/50">Venta {sale.order_number}</p>
                  <p className="mt-2 text-sm text-[#1F1F1F]/60">
                    {sale.productCount} productos · Total {currencyFormatter.format(Number(sale.total))} · Pagado {currencyFormatter.format(sale.totalPaid)} · Saldo {currencyFormatter.format(sale.remainingAmount)}
                  </p>
                </div>
                <Link href={`/admin/ventas/${sale.id}`} className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#556B2F] hover:text-[#556B2F]">
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
