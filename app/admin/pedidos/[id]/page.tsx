import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { CustomerOrderPaymentForm, CustomerOrderStatusActions } from "@/components/admin/orders/customer-order-actions";
import { requireAdminSession } from "@/lib/admin-session";
import { CUSTOMER_ORDER_STATUS_LABELS, getWhatsAppUrl, isCustomerOrderEditable } from "@/lib/orders/workflow";
import { getCustomerOrderById } from "@/services/customer-orders";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });
const shortDate = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" });
const paymentLabels: Record<string, string> = { pending: "Pendiente", partial: "Parcial", paid: "Pagado", refunded: "Reintegrado" };
const methodLabels: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", mercadopago: "Mercado Pago", other: "Otro" };

type OrderDetailPageProps = { params: Promise<{ id: string }> };

export default async function CustomerOrderDetailPage({ params }: OrderDetailPageProps) {
  await requireAdminSession();
  const { id } = await params;
  const order = await getCustomerOrderById(id);
  if (!order) notFound();
  const editable = isCustomerOrderEditable(order.status);
  const whatsappUrl = getWhatsAppUrl(order.customer_phone);

  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Link href="/admin/pedidos" className="text-sm font-semibold text-[#8B5E3C]">Volver a pedidos</Link>
      <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-[#556B2F]/10 px-3 py-1 text-[#556B2F]">{CUSTOMER_ORDER_STATUS_LABELS[order.status]}</span><span className="rounded-full bg-[#8B5E3C]/10 px-3 py-1 text-[#8B5E3C]">Pago {paymentLabels[order.payment_status] ?? order.payment_status}</span></div><h1 className="mt-3 break-words text-4xl font-semibold">{order.customer_name}</h1><p className="mt-2 text-sm text-[#1F1F1F]/55">Pedido {order.order_number} · {dateTime.format(new Date(order.created_at))}</p></div>
        <div className="flex flex-wrap gap-3">{whatsappUrl ? <Link href={whatsappUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#556B2F]/30 px-5 py-3 text-sm font-semibold text-[#556B2F]">Contactar</Link> : null}{editable ? <Link href={`/admin/pedidos/${order.id}/editar`} className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-sm font-semibold text-[#8B5E3C]">Editar</Link> : null}</div>
      </div>

      <section className="mt-8 grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><span className="text-xs text-[#1F1F1F]/50">Telefono</span><p className="mt-1 font-semibold">{order.customer_phone ?? "Sin telefono"}</p></div>
        <div><span className="text-xs text-[#1F1F1F]/50">Fecha estimada</span><p className="mt-1 font-semibold">{order.estimated_date ? shortDate.format(new Date(`${order.estimated_date}T12:00:00`)) : "Sin fecha"}</p></div>
        <div><span className="text-xs text-[#1F1F1F]/50">Total</span><p className="mt-1 font-semibold">{money.format(Number(order.total))}</p></div>
        <div><span className="text-xs text-[#1F1F1F]/50">Saldo</span><p className="mt-1 font-semibold">{money.format(order.remainingAmount)}</p></div>
        {order.notes ? <div className="sm:col-span-2 lg:col-span-4"><span className="text-xs text-[#1F1F1F]/50">Notas</span><p className="mt-1 whitespace-pre-wrap">{order.notes}</p></div> : null}
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm"><h2 className="text-xl font-semibold">Productos</h2><div className="mt-4 grid gap-3">{order.order_items.map((item) => <article key={item.id} className="grid gap-2 rounded-2xl bg-[#F7F4ED] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold">{item.product_name}</p><p className="mt-1 text-sm text-[#1F1F1F]/55">{item.quantity} × {money.format(Number(item.unit_price))}</p></div><strong>{money.format(Number(item.subtotal))}</strong></article>)}</div></section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm"><h2 className="text-xl font-semibold">Pagos</h2><p className="mt-2 text-sm text-[#1F1F1F]/60">Pagado {money.format(order.totalPaid)} · Saldo {money.format(order.remainingAmount)}</p><div className="mt-4 grid gap-2">{order.order_payments.length ? order.order_payments.map((payment) => <div key={payment.id} className="flex flex-wrap justify-between gap-3 border-b border-[#8B5E3C]/10 pb-2 text-sm"><span>{methodLabels[payment.method] ?? payment.method}{payment.notes ? ` · ${payment.notes}` : ""}</span><strong>{money.format(Number(payment.amount))}</strong></div>) : <p className="text-sm text-[#1F1F1F]/55">Todavia no hay pagos.</p>}</div>{editable && order.remainingAmount > 0 ? <CustomerOrderPaymentForm orderId={order.id} remainingAmount={order.remainingAmount} paymentSequence={order.order_payments.length + 1} /> : null}</section>
        <section className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm"><h2 className="text-xl font-semibold">Operacion</h2><p className="mt-2 text-sm text-[#1F1F1F]/60">Listo no modifica inventario. Solo Entregar descuenta stock, exige pago completo y es atomico.</p><div className="mt-5">{editable ? <CustomerOrderStatusActions orderId={order.id} status={order.status} paymentStatus={order.payment_status} /> : <p className="text-sm font-semibold text-[#1F1F1F]/60">Pedido de solo lectura.</p>}</div></section>
      </div>

      {order.status === "delivered" ? <section className="mt-6 rounded-[2rem] border border-[#556B2F]/20 bg-[#556B2F]/5 p-5"><h2 className="text-xl font-semibold">Movimientos de inventario</h2><p className="mt-1 text-sm text-[#1F1F1F]/60">Entregado {order.delivered_at ? dateTime.format(new Date(order.delivered_at)) : ""}</p><div className="mt-4 grid gap-2">{order.inventory_movements?.map((movement) => <div key={movement.id} className="flex flex-wrap justify-between gap-3 text-sm"><span>{movement.reason ?? "Entrega de pedido"}</span><span>{movement.previous_stock} → {movement.new_stock} ({movement.quantity})</span></div>)}</div></section> : null}
    </section>
  </main>;
}
