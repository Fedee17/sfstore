import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { CUSTOMER_ORDER_STATUSES, CUSTOMER_ORDER_STATUS_LABELS } from "@/lib/orders/workflow";
import { listCustomerOrders } from "@/services/customer-orders";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat("es-AR", { dateStyle: "short" });
const paymentLabels: Record<string, string> = { pending: "Pendiente", partial: "Parcial", paid: "Pagado", refunded: "Reintegrado" };

type OrdersPageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  const filters = { status: scalar(params.status), paymentStatus: scalar(params.paymentStatus), search: scalar(params.search), date: scalar(params.date) };
  const orders = await listCustomerOrders(filters);

  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">Admin</p><h1 className="mt-3 text-4xl font-semibold">Pedidos</h1><p className="mt-2 text-sm text-[#1F1F1F]/60">Encargos, pagos y entrega final con inventario auditable.</p></div>
        <Link href="/admin/pedidos/nuevo" className="rounded-full bg-[#556B2F] px-6 py-3 text-center text-sm font-semibold text-[#F7F4ED] hover:bg-[#465826]">Nuevo pedido</Link>
      </div>
      <p className="mt-6 rounded-2xl border border-[#8B5E3C]/15 bg-white/70 px-4 py-3 text-sm text-[#1F1F1F]/65">Los pedidos no reservan stock aunque tengan pago. La salida fisica ocurre al entregar.</p>
      <form className="mt-5 grid gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-5 md:items-end">
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">Cliente, telefono o producto<input name="search" defaultValue={filters.search} className="h-11 min-w-0 rounded-xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3" /></label>
        <label className="grid gap-2 text-sm font-semibold">Estado<select name="status" defaultValue={filters.status} className="h-11 rounded-xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3"><option value="">Todos</option>{CUSTOMER_ORDER_STATUSES.map((status) => <option key={status} value={status}>{CUSTOMER_ORDER_STATUS_LABELS[status]}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-semibold">Pago<select name="paymentStatus" defaultValue={filters.paymentStatus} className="h-11 rounded-xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3"><option value="">Todos</option><option value="pending">Pendiente</option><option value="partial">Parcial</option><option value="paid">Pagado</option><option value="refunded">Reintegrado</option></select></label>
        <label className="grid gap-2 text-sm font-semibold">Fecha<input type="date" name="date" defaultValue={filters.date} className="h-11 rounded-xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3" /></label>
        <button className="h-11 rounded-xl border border-[#556B2F]/30 px-5 text-sm font-semibold text-[#556B2F] hover:bg-[#556B2F]/10 md:col-start-5">Filtrar</button>
      </form>
      {orders.length === 0 ? <div className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-8 text-center shadow-sm"><h2 className="text-2xl font-semibold">No hay pedidos para este filtro</h2></div> : <div className="mt-8 grid gap-4">{orders.map((order) => <article key={order.id} className="grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0"><div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-[#556B2F]/10 px-3 py-1 text-[#556B2F]">{CUSTOMER_ORDER_STATUS_LABELS[order.status]}</span><span className="rounded-full bg-[#8B5E3C]/10 px-3 py-1 text-[#8B5E3C]">Pago {paymentLabels[order.payment_status] ?? order.payment_status}</span></div><h2 className="mt-3 break-words text-xl font-semibold">{order.customer_name} · {order.displayName}</h2><p className="mt-1 text-xs text-[#1F1F1F]/50">Pedido {order.order_number} · {shortDate.format(new Date(order.created_at))}</p><p className="mt-2 text-sm text-[#1F1F1F]/60">Total {money.format(Number(order.total))} · Pagado {money.format(order.totalPaid)} · Saldo {money.format(order.remainingAmount)}{order.estimated_date ? ` · Estimado ${shortDate.format(new Date(`${order.estimated_date}T12:00:00`))}` : ""}</p></div>
        <Link href={`/admin/pedidos/${order.id}`} className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-center text-sm font-semibold text-[#8B5E3C] hover:border-[#556B2F] hover:text-[#556B2F]">Ver pedido</Link>
      </article>)}</div>}
    </section>
  </main>;
}
