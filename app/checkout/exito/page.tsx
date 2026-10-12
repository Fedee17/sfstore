import Link from "next/link";
import { transferPayment } from "@/lib/payment";
import { getBuyerCheckoutReceipt } from "@/services/checkout-buyer-receipt";
import { CheckoutPaymentReportForm } from "@/components/checkout-payment-report-form";
const currency=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2,maximumFractionDigits:2});
export default async function CheckoutSuccessPage({searchParams}:{searchParams:Promise<{order?:string;number?:string;total?:string}>}) {
 const order=await getBuyerCheckoutReceipt((await searchParams).order??"");
 if(!order||order.payment_method!=="transfer") return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-semibold">Revisá el estado de tu pedido</h1><p>No hay un pedido autorizado para mostrar. No realices una transferencia sin confirmar su estado con la tienda.</p><Link href="/carrito">Volver al carrito</Link></main>;
 const paid=order.payment_status==="paid";const reported=order.report?.status==="pending";
 const awaitingAccreditation=order.state==="confirmed"&&!paid;
 const closed=["expired","cancelled"].includes(order.state)||(order.expired&&!reported&&!paid);
 const title=paid?"Pago confirmado":reported?"Pago informado, pendiente de verificación":awaitingAccreditation?"Pedido pendiente de acreditación":closed?"Reserva finalizada":"Esperando transferencia";
 return <main className="mx-auto max-w-3xl p-8"><Link href="/">SFSTORE Importados</Link><h1 className="mt-6 text-3xl font-semibold">{title}</h1><h2 className="mt-6">Número de orden</h2><p>{order.order_number}</p><p className="mt-4">Total exacto: {currency.format(order.total)}. Incluye el descuento único del 25% sobre los productos.</p>
 {paid?<p>La tienda verificó la acreditación completa de tu transferencia.</p>:reported?<p>El comprobante no constituye acreditación. Conservamos la reserva hasta la revisión administrativa; no vuelvas a transferir este importe.</p>:closed?<p>No transfieras para este pedido. {order.report?.rejection_reason?`Motivo del rechazo: ${order.report.rejection_reason}`:"El plazo de la reserva finalizó."} Consultá al local antes de preparar otro pedido.</p>:<>
 <p className="mt-4">Tenés 24 horas desde la creación para transferir el 100% del total e informar el pago en esta pantalla con comprobante. No se admiten señas ni pagos parciales.</p><p>Plazo para realizar e informar el pago: {new Date(order.expiresAt).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"})}.</p>
 <dl className="my-6 grid gap-2"><dt>Total a transferir</dt><dd>{currency.format(order.total)}</dd><dt>Alias</dt><dd>{transferPayment.alias}</dd><dt>Titular</dt><dd>{transferPayment.holder}</dd><dt>Banco/billetera</dt><dd>{transferPayment.provider}</dd><dt>CUIT/CUIL</dt><dd>{transferPayment.taxId}</dd></dl>
 <CheckoutPaymentReportForm orderId={order.id} operationKey={order.report?.operation_key}/></>}
 {order.report&&order.report.status!=="uploading"?<a className="block mt-6 underline" href={`/api/checkout/payment-proof/${order.id}`}>Consultar comprobante privado</a>:null}
 <p className="mt-6">Guardá esta ventana y el número de orden para el seguimiento. Un mensaje por WhatsApp no reemplaza el aviso de pago en esta pantalla.</p><Link href="/carrito">Volver al carrito</Link></main>;
}
