import { AdminNav } from "@/components/admin/admin-nav";
import { brand } from "@/lib/brand";
import { requireAdminSession } from "@/lib/admin-session";
import { getAdminOrders, type AdminOrder } from "@/services/admin";
import { updateOrderState } from "./actions";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AdminOrdersPage() {
  await requireAdminSession();
  const ordersResult = await getAdminOrders();
  const orders = ordersResult.data ?? [];

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
          Admin
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Pedidos</h1>

        {ordersResult.error ? (
          <div className="mt-8 rounded-3xl border border-[#8B5E3C]/20 bg-white/70 p-5 text-sm font-semibold text-[#8B5E3C]">
            {ordersResult.error}
          </div>
        ) : null}

        {orders.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">No hay pedidos todavia</h2>
            <p className="mt-3 text-sm text-[#1F1F1F]/60">
              Cuando el checkout cree ordenes reales, van a aparecer aca.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function OrderCard({ order }: { order: AdminOrder }) {
  const customer = order.customers;
  const summary = [
    `Pedido: ${order.order_number}`,
    `Cliente: ${customer?.full_name ?? "Sin nombre"}`,
    `Telefono: ${customer?.phone ?? "Sin telefono"}`,
    `Pago: ${order.payment_method} (${order.payment_status})`,
    `Estado: ${order.status}`,
    `Total: ${currencyFormatter.format(order.total)}`,
    "Productos:",
    ...(order.order_items ?? []).map(
      (item) =>
        `- ${item.product_name} x ${item.quantity}: ${currencyFormatter.format(item.subtotal)}`,
    ),
  ].join("\n");

  return (
    <article className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
            {dateFormatter.format(new Date(order.created_at))}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{order.order_number}</h2>
          <div className="mt-3 grid gap-2 text-sm text-[#1F1F1F]/70 md:grid-cols-2">
            <p>Cliente: {customer?.full_name ?? "Sin nombre"}</p>
            <p>Telefono: {customer?.phone ?? "Sin telefono"}</p>
            <p>Pago: {order.payment_method}</p>
            <p>Pago estado: {order.payment_status}</p>
            <p>Orden estado: {order.status}</p>
            <p>Total: {currencyFormatter.format(order.total)}</p>
          </div>
        </div>
        <p className="rounded-full bg-[#556B2F]/10 px-4 py-2 text-sm font-semibold text-[#556B2F]">
          {currencyFormatter.format(order.total)}
        </p>
      </div>

      <form
        action={updateOrderState}
        className="mt-5 grid gap-3 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 md:grid-cols-[1fr_1fr_auto]"
      >
        <input type="hidden" name="orderId" value={order.id} />
        <label className="grid gap-2 text-sm font-semibold text-[#1F1F1F]/75">
          Estado del pedido
          <select
            name="status"
            defaultValue={order.status}
            className="rounded-2xl border border-[#8B5E3C]/20 bg-white/70 px-4 py-3 font-medium outline-none transition focus:border-[#556B2F]"
          >
            <option value="pending">pending</option>
            <option value="confirmed">confirmed</option>
            <option value="paid">paid</option>
            <option value="preparing">preparing</option>
            <option value="shipped">shipped</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#1F1F1F]/75">
          Estado del pago
          <select
            name="paymentStatus"
            defaultValue={order.payment_status}
            className="rounded-2xl border border-[#8B5E3C]/20 bg-white/70 px-4 py-3 font-medium outline-none transition focus:border-[#556B2F]"
          >
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="refunded">refunded</option>
          </select>
        </label>
        <button
          type="submit"
          className="self-end rounded-full bg-[#556B2F] px-5 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826]"
        >
          Guardar cambios
        </button>
      </form>

      <details className="mt-5 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#8B5E3C]">
          Ver detalle
        </summary>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold">Cliente y entrega</h3>
            <div className="mt-3 space-y-1 text-sm text-[#1F1F1F]/70">
              <p>Email: {customer?.email ?? "Sin email"}</p>
              {order.shipping_method === "pickup" ? (
                <>
                  <p>Tipo de entrega: Retiro en punto de entrega</p>
                  <p>Direccion: {brand.address}</p>
                  <p>Horario: {brand.hours}</p>
                </>
              ) : (
                <>
                  <p>Tipo de entrega: Envio</p>
                  <p>Provincia: {order.shipping_province ?? customer?.province ?? "-"}</p>
                  <p>Ciudad: {order.shipping_city ?? customer?.city ?? "-"}</p>
                  <p>Direccion: {order.shipping_address ?? customer?.address ?? "-"}</p>
                  <p>Codigo postal: {order.shipping_postal_code ?? customer?.postal_code ?? "-"}</p>
                  <p>Transporte: {order.shipping_carrier ?? "-"}</p>
                </>
              )}
            </div>
          </div>
          <div>
            <h3 className="font-semibold">Productos</h3>
            <div className="mt-3 space-y-2 text-sm">
              {(order.order_items ?? []).length === 0 ? (
                <p className="text-[#1F1F1F]/60">Sin items registrados.</p>
              ) : (
                order.order_items?.map((item) => (
                  <div key={item.id} className="flex justify-between gap-4 border-b border-[#8B5E3C]/10 pb-2">
                    <span>
                      {item.product_name} x {item.quantity}
                    </span>
                    <span className="font-semibold text-[#8B5E3C]">
                      {currencyFormatter.format(item.subtotal)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="mt-5">
          <p className="text-sm font-semibold text-[#8B5E3C]">
            Resumen para WhatsApp
          </p>
          <textarea
            readOnly
            value={summary}
            className="mt-2 min-h-40 w-full rounded-2xl border border-[#8B5E3C]/20 bg-white/70 p-3 text-sm"
          />
        </div>
      </details>
    </article>
  );
}
