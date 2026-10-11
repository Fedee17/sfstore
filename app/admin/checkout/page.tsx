import { requireAdminSession } from "@/lib/admin-session";
import { listManualCheckoutOrders, listShippingQuotationRequests } from "@/services/checkout-manual-admin";
import { AdminNav } from "@/components/admin/admin-nav";
import { ManualCheckoutPaymentForm, ReleaseCheckoutReservationsForm } from "@/components/admin/checkout-manual-forms";
export default async function CheckoutAdministrationPage() {
  await requireAdminSession();
  const [orders,quotations] = await Promise.all([listManualCheckoutOrders(),listShippingQuotationRequests()]);
  return <main><AdminNav /><section className="mx-auto max-w-4xl p-6">
    <h1 className="text-3xl font-semibold">Pedidos web y pagos manuales</h1>
    <ReleaseCheckoutReservationsForm />
    <p>Últimos 100 pedidos. Confirmar el pedido y acreditar el pago son estados diferentes.</p>
    <h2 className="mt-6 text-xl font-semibold">Solicitudes de cotización (sin pedido ni reserva)</h2>
    {quotations.map(quote=><article key={quote.id} className="my-3 rounded border p-4"><p>{quote.request.customer.fullName} · {quote.request.customer.phone}</p><p>{quote.request.shipping.province}, {quote.request.shipping.city}, {quote.request.shipping.postalCode} · {quote.request.shipping.address}</p><ul>{quote.items.map(item=><li key={item.productId}>{item.quantity} × {item.name}</li>)}</ul><p>Referencia: {quote.id}</p></article>)}
    {orders.map(order => <article className="my-5 rounded border p-4" key={order.order_id}>
      <h2>{order.result.orderNumber}</h2><p>{order.state} · {order.result.paymentMethod === "cash" ? "Efectivo al retirar" : "Transferencia"} · Total: {order.result.total}</p>
      <p>Reserva hasta: {order.expires_at}</p>
      {order.state === "pending" ? <ManualCheckoutPaymentForm order={order} /> : null}
    </article>)}
  </section></main>;
}
