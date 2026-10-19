import Link from "next/link";
import { requireAdminSession } from "@/lib/admin-session";
import { listManualCheckoutOrders, listShippingQuotationRequests, getCheckoutExpirationHealth } from "@/services/checkout-manual-admin";
import { AdminNav } from "@/components/admin/admin-nav";
import { ManualCheckoutPaymentForm, ReleaseCheckoutReservationsForm, RejectCheckoutPaymentForm, CheckoutBuyerExceptionForm, ShippingQuotationForm } from "@/components/admin/checkout-manual-forms";
export default async function CheckoutAdministrationPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
  const rawPage=Number((await searchParams).page??0);const page=Number.isInteger(rawPage)&&rawPage>=0&&rawPage<=10000?rawPage:0;
  await requireAdminSession();
  const [orders,quotations,health] = await Promise.all([listManualCheckoutOrders(page),listShippingQuotationRequests(),getCheckoutExpirationHealth().catch(()=>null)]);
  return <main><AdminNav /><section className="mx-auto max-w-4xl p-6">
    <h1 className="text-3xl font-semibold">Pedidos web y pagos manuales</h1>
    <section className="my-6 rounded border p-4" aria-label="Supervisión de reservas">
      <h2 className="text-xl font-semibold">Supervisión de reservas</h2>
      {!health ? <p role="alert">No se pudo consultar la supervisión. Revisá el estado del ejecutor; la liberación manual sigue disponible.</p> : <>
        <p>{health.monitoringEnabled ? "Ejecución automática esperada cada 5 minutos." : "Ejecución automática preparada, no activada."}</p>
        <p>Vencidas sin aviso pendientes de liberar: {health.due}. Protegidas por aviso en revisión: {health.protectedReports}.</p>
        <p>Último lote procesado: {health.lastProgressAt ?? "Sin ejecuciones registradas"}. Estado más reciente: {health.lastRunStatus ?? "Sin ejecuciones"}.</p>
        {["partial","failed"].includes(health.lastRunStatus ?? "") ? <p role="alert">La última ejecución registró errores. Revisá el historial y los bloqueos; el siguiente lote puede reintentar las reservas pendientes.</p> : null}
        {health.heartbeatOverdue ? <p role="alert">Ejecutor atrasado: no registró un lote procesado dentro del plazo de supervisión.</p> : null}
        {health.backlogOverdue ? <p role="alert">Hay reservas vencidas demoradas. Revisá bloqueos, errores y la próxima ejecución o liberá manualmente.</p> : null}
        <details><summary>Últimas 10 ejecuciones</summary><ul>{health.recentRuns.map((run,index)=><li key={index}>{run.finished_at} · {run.status} · liberadas: {run.released} · pendientes: {run.due_after} · errores: {run.failed_orders}</li>)}</ul></details>
      </>}
    </section>
    <ReleaseCheckoutReservationsForm />
    <p>Página {page+1}, hasta 100 pedidos. Pendientes primero, del más antiguo al más reciente. Sólo la acreditación bancaria completa confirma el pago. El aviso del comprador conserva la reserva hasta una decisión explícita.</p>
    <h2 className="mt-6 text-xl font-semibold">Solicitudes de cotización (sin pedido ni reserva)</h2>
    {quotations.map(quote=><article key={quote.id} className="my-3 rounded border p-4"><p>{quote.request.customer.fullName} · {quote.request.customer.phone}</p><p>{quote.request.shipping.province}, {quote.request.shipping.city}, {quote.request.shipping.postalCode} · {quote.request.shipping.address}</p><ul>{quote.items.map(item=><li key={item.productId}>{item.quantity} × {item.name}</li>)}</ul><p>Transporte preferido: {quote.request.shipping.carrier??"Sin preferencia registrada"}</p><p>Referencia: {quote.id}</p>{quote.status==="requested"?<ShippingQuotationForm quoteId={quote.id}/>:<p>Cotización comunicada: envío ${quote.shipping_fee}, total ${quote.quoted_total}. Válida hasta {quote.valid_until}. {quote.accepted_order_id?"Aceptada; pedido creado.":"Sin pedido ni reserva; pendiente de aceptación."}</p>}</article>)}
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
