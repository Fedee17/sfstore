import Link from "next/link";
import { requireAdminSession } from "@/lib/admin-session";
import { listManualCheckoutOrders, listShippingQuotationRequests } from "@/services/checkout-manual-admin";
import { AdminNav } from "@/components/admin/admin-nav";
import { ManualCheckoutPaymentForm, ReleaseCheckoutReservationsForm, RejectCheckoutPaymentForm, CheckoutBuyerExceptionForm } from "@/components/admin/checkout-manual-forms";
export default async function CheckoutAdministrationPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
  const rawPage=Number((await searchParams).page??0);const page=Number.isInteger(rawPage)&&rawPage>=0&&rawPage<=10000?rawPage:0;
  await requireAdminSession();
  const [orders,quotations] = await Promise.all([listManualCheckoutOrders(page),listShippingQuotationRequests()]);
  return <main><AdminNav /><section className="mx-auto max-w-4xl p-6">
    <h1 className="text-3xl font-semibold">Pedidos web y pagos manuales</h1>
    <ReleaseCheckoutReservationsForm />
    <p>Página {page+1}, hasta 100 pedidos. Pendientes primero, del más antiguo al más reciente. Sólo la acreditación bancaria completa confirma el pago. El aviso del comprador conserva la reserva hasta una decisión explícita.</p>
    <h2 className="mt-6 text-xl font-semibold">Solicitudes de cotización (sin pedido ni reserva)</h2>
    {quotations.map(quote=><article key={quote.id} className="my-3 rounded border p-4"><p>{quote.request.customer.fullName} · {quote.request.customer.phone}</p><p>{quote.request.shipping.province}, {quote.request.shipping.city}, {quote.request.shipping.postalCode} · {quote.request.shipping.address}</p><ul>{quote.items.map(item=><li key={item.productId}>{item.quantity} × {item.name}</li>)}</ul><p>Referencia: {quote.id}</p></article>)}
    {orders.map(order => <article className="my-5 rounded border p-4" key={order.order_id}>
      <h2>{order.result.orderNumber}</h2><p>{order.report?.status === "pending" ? "Pago informado, pendiente de verificación" : order.payment_status === "paid" ? "Pago confirmado" : order.state === "pending" ? "Esperando transferencia" : order.state} · Transferencia · Total: {order.result.total}</p>
      <p>Reserva hasta: {order.expires_at}</p>
      {order.report?.overdue?<p role="alert">Revisión atrasada: superó el plazo objetivo de revisión. La reserva sigue protegida hasta una decisión administrativa.</p>:null}
      {order.report?.status&&order.report.status!=="uploading"?<Link href={`/api/checkout/payment-proof/${order.order_id}`} prefetch={false} download>Consultar comprobante privado</Link>:null}
      {order.state === "pending" && order.result.paymentMethod === "transfer" ? <ManualCheckoutPaymentForm order={order} /> : null}
      {order.report?.status === "pending"?<RejectCheckoutPaymentForm orderId={order.order_id}/>:null}
      {order.report?.rejection_reason?<p>Motivo: {order.report.rejection_reason}</p>:null}
      <details><summary>Historial de acciones</summary><ul>{order.history.map((entry,index)=><li key={index}>{entry.created_at} · {entry.event} · {JSON.stringify(entry.details)}</li>)}</ul></details>
      <CheckoutBuyerExceptionForm buyerId={order.buyer_id}/>
    </article>)}
  <nav>{page>0?<Link href={`/admin/checkout?page=${page-1}`} prefetch={false}>Página anterior</Link>:null} {orders.length===100?<Link href={`/admin/checkout?page=${page+1}`} prefetch={false}>Página siguiente</Link>:null}</nav></section></main>;
}
