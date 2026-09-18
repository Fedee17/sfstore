import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { StoreSalePaymentForm } from "@/components/admin/sales/store-sale-payment-form";
import { requireAdminSession } from "@/lib/admin-session";
import { getStoreSaleDisplayName } from "@/lib/store-sales";
import { getStoreSaleById } from "@/services/store-sales";

const currencyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });
const methodLabels: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", other: "Otro", mercadopago: "Mercado Pago" };

export default async function StoreSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession();
  const { id } = await params;
  const sale = await getStoreSaleById(id);
  if (!sale) notFound();

  const customerName = typeof sale.metadata?.customer_name === "string" ? sale.metadata.customer_name : "Sin cliente informado";
  const canAddPayment = sale.payment_status === "pending" || sale.payment_status === "partial";
  const paidWithoutInventory =
    sale.payment_status === "paid" && !sale.inventory_movements?.length;
  const displayName = getStoreSaleDisplayName(
    sale.order_number,
    sale.order_items,
  );

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Link href="/admin/ventas" className="text-sm font-semibold text-[#8B5E3C]">Volver a ventas</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-semibold">{displayName}</h1>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">Venta {sale.order_number}</p>
            <p className="mt-1 text-sm text-[#1F1F1F]/60">{customerName} · {dateFormatter.format(new Date(sale.created_at))}</p>
          </div>
          <span className="rounded-full bg-[#556B2F]/10 px-4 py-2 text-sm font-semibold text-[#556B2F]">{sale.payment_status}</span>
        </div>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_9rem] gap-3 border-b border-[#8B5E3C]/15 px-5 py-3 text-xs font-semibold uppercase text-[#1F1F1F]/55">
            <span>Producto</span><span>Cant.</span><span>Precio</span><span>Subtotal</span>
          </div>
          {sale.order_items.map((item) => (
            <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_5rem_8rem_9rem] gap-3 border-b border-[#8B5E3C]/10 px-5 py-4 text-sm last:border-0">
              <span className="min-w-0 break-words font-semibold">{item.product_name}</span>
              <span>{item.quantity}</span>
              <span>{currencyFormatter.format(Number(item.unit_price))}</span>
              <strong>{currencyFormatter.format(Number(item.subtotal))}</strong>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 rounded-[2rem] border border-[#556B2F]/20 bg-[#556B2F]/5 p-5 sm:grid-cols-3">
          <div><span className="text-xs uppercase text-[#1F1F1F]/55">Total</span><strong className="mt-1 block text-xl">{currencyFormatter.format(Number(sale.total))}</strong></div>
          <div><span className="text-xs uppercase text-[#1F1F1F]/55">Pagado</span><strong className="mt-1 block text-xl">{currencyFormatter.format(sale.totalPaid)}</strong></div>
          <div><span className="text-xs uppercase text-[#1F1F1F]/55">Saldo</span><strong className="mt-1 block text-xl">{currencyFormatter.format(sale.remainingAmount)}</strong></div>
          {sale.payment_status === "partial" ? <p className="text-sm font-semibold text-[#8B5E3C] sm:col-span-3">Pago parcial: el stock no fue descontado ni reservado.</p> : null}
          {paidWithoutInventory ? <p role="alert" className="text-sm font-semibold text-[#8B5E3C] sm:col-span-3">El pago esta completo, pero el stock no fue descontado. La venta requiere revision manual.</p> : null}
        </section>

        <section className="mt-6 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Pagos</h2>
          {sale.order_payments.length ? (
            <div className="mt-4 grid gap-2">
              {sale.order_payments.map((payment) => (
                <div key={payment.id} className="flex flex-wrap justify-between gap-3 rounded-2xl bg-[#F7F4ED] px-4 py-3 text-sm">
                  <span><strong>{methodLabels[payment.method] ?? payment.method}</strong> · {payment.status}</span>
                  <strong>{currencyFormatter.format(Number(payment.amount))}</strong>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-[#1F1F1F]/60">Todavia no hay pagos registrados.</p>}
          {canAddPayment ? <StoreSalePaymentForm orderId={sale.id} remainingAmount={sale.remainingAmount} paymentSequence={sale.order_payments.length + 1} /> : <p className={`mt-4 text-sm font-semibold ${paidWithoutInventory ? "text-[#8B5E3C]" : "text-[#556B2F]"}`}>Venta pagada. Los pagos quedan en modo consulta.</p>}
        </section>

        <section className="mt-6 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Movimientos de inventario</h2>
          {sale.inventory_movements?.length ? (
            <div className="mt-4 grid gap-2">
              {sale.inventory_movements.map((movement) => (
                <div key={movement.id} className="rounded-2xl bg-[#F7F4ED] px-4 py-3 text-sm">Cantidad {movement.quantity} · Stock {movement.previous_stock} → {movement.new_stock}</div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-[#1F1F1F]/60">Sin movimientos. El stock solo se actualiza al completar el pago.</p>}
        </section>
      </section>
    </main>
  );
}
