import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TransferAlias } from "@/components/transfer-alias";
import { getBuyerCheckoutReceipt } from "@/services/checkout-buyer-receipt";
import { CheckoutPaymentReportForm } from "@/components/checkout-payment-report-form";
import { MercadoPagoPayment } from "@/components/mercadopago-payment";
import { CatalogFrame } from "@/components/catalog/catalog-frame";
import { brand } from "@/lib/brand";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import styles from "../checkout.module.css";
export const metadata: Metadata = { title: "Tu pedido" };
const currency=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2,maximumFractionDigits:2});
// Owner request 20/11: same boutique frame as the cart, delivery step and checkout.
const frame=(children:ReactNode)=><CatalogFrame><div className="mx-auto max-w-6xl px-5 py-6 sm:px-8"><section className={styles.receipt}>{children}</section></div></CatalogFrame>;
export default async function CheckoutSuccessPage({searchParams}:{searchParams:Promise<{order?:string;number?:string;total?:string}>}) {
 const order=await getBuyerCheckoutReceipt((await searchParams).order??"");
 if(order?.payment_method==="mercadopago") return mercadoPagoReceipt(order);
 if(!order||order.payment_method!=="transfer") return frame(<div className={`${styles.panel} ${styles.empty}`}><h1>Revisá el estado de tu pedido</h1><p>No hay un pedido autorizado para mostrar. No realices una transferencia sin confirmar su estado con la tienda.</p><div><a href={buildWhatsAppUrl("Hola SFSTORE, tengo un pedido y no veo los datos de pago. ¿Me ayudan?")} target="_blank" rel="noopener noreferrer" className={styles.primary}>Consultar por WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span></a><Link href="/carrito" className={styles.secondary}>Volver al carrito</Link></div></div>);
 const paid=order.payment_status==="paid";const reported=order.report?.status==="pending";
 const awaitingAccreditation=order.state==="confirmed"&&!paid;
 const closed=["expired","cancelled"].includes(order.state)||(order.expired&&!reported&&!paid);
 const title=paid?"Pago confirmado":reported?"Pago informado, pendiente de verificación":awaitingAccreditation?"Pedido pendiente de acreditación":closed?"Reserva finalizada":"Esperando transferencia";
 return frame(<><h1>{title}</h1>
 <div className={styles.panel}><div><h2>Número de pedido</h2><p className={styles.orderNumber}>{order.order_number}</p></div><p>Total exacto: {currency.format(order.total)}. Incluye el precio de contado de los productos.</p>
 <ul className={styles.receiptLines} aria-label="Productos del pedido">{(order.lines??[]).map(line=><li key={line.id}><strong>{line.product_name}</strong><span> · {line.quantity} {line.quantity === 1 ? "unidad" : "unidades"} · </span><span className={styles.receiptPrice}>{currency.format(Number(line.subtotal))}</span></li>)}</ul>
 {(order.lines??[]).some(line=>line.combo_group)?<p className={styles.muted}>Los conjuntos se muestran desglosados en sus componentes. Sus importes suman el precio especial del combo; no se agrega otro descuento sobre esas líneas.</p>:null}</div>
 {paid?<p className={styles.info}>La tienda verificó la acreditación completa de tu transferencia.</p>:reported?<p className={styles.info}>El comprobante no constituye acreditación. Conservamos la reserva hasta la revisión administrativa; no vuelvas a transferir este importe.</p>:closed?<p className={styles.info}>No transfieras para este pedido. {order.report?.rejection_reason?`Motivo del rechazo: ${order.report.rejection_reason}`:"El plazo de la reserva finalizó."} Consultá al local antes de preparar otro pedido.</p>:<div className={`${styles.panel} ${styles.payment}`}>
 <p>Tenés 24 horas desde que se creó el pedido para transferir el 100% del total e informar el pago en esta pantalla con comprobante. No se admiten señas ni pagos parciales.</p><p>Plazo para realizar e informar el pago: {new Date(order.expiresAt).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})} hs.</p>
 <dl className={styles.amount}><dt>Total a transferir</dt><dd>{currency.format(order.total)}</dd></dl><TransferAlias />
 <CheckoutPaymentReportForm orderId={order.id} operationKey={order.report?.operation_key}/></div>}
 {order.report&&order.report.status!=="uploading"?<a className={styles.back} href={`/api/checkout/payment-proof/${order.id}`}>Consultar comprobante privado</a>:null}
 <div className={styles.muted}>{order.shipping_method==="pickup"?<><p>Retiro en el local sin cargo. Esperá la confirmación del local antes de retirar.</p><p>{brand.address}. {brand.hours}.</p></>:null}<p className="mt-3">Guardá esta ventana y el número de pedido para el seguimiento. Un mensaje por WhatsApp no reemplaza el aviso de pago en esta pantalla.</p><p className="mt-3"><a className={styles.back} href={buildWhatsAppUrl(`Hola SFSTORE, tengo una consulta sobre el pedido ${order.order_number}.`)} target="_blank" rel="noopener noreferrer">Consultar por WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span></a></p></div><Link href="/carrito" className={styles.back}>Volver al carrito</Link></>);
}

// Mercado Pago orders (26/11/2026): the status comes from the database (webhook or card payment confirmation).
function mercadoPagoReceipt(order: NonNullable<Awaited<ReturnType<typeof getBuyerCheckoutReceipt>>>) {
 const paid=order.payment_status==="paid";const closed=["expired","cancelled"].includes(order.state)||(order.expired&&!paid);
 const installments=order.price_mode==="financiado";
 const title=paid?"Pago confirmado":closed?"Reserva finalizada":"Completá el pago";
 return frame(<><h1>{title}</h1>
 <div className={styles.panel}><div><h2>Número de pedido</h2><p className={styles.orderNumber}>{order.order_number}</p></div>
 <p>Total {installments?"en cuotas (precio de lista)":"en un pago (precio de contado)"}: {currency.format(order.total)}.</p>
 <ul className={styles.receiptLines} aria-label="Productos del pedido">{(order.lines??[]).map(line=><li key={line.id}><strong>{line.product_name}</strong><span> · {line.quantity} {line.quantity === 1 ? "unidad" : "unidades"} · </span><span className={styles.receiptPrice}>{currency.format(Number(line.subtotal))}</span></li>)}</ul></div>
 {paid?<p className={styles.info}>Mercado Pago acreditó el pago y tu pedido quedó confirmado. Te avisamos cuando esté listo.</p>
  :closed?<p className={styles.info}>La reserva venció sin un pago aprobado. Si pagaste igual, escribinos: revisamos cada pago antes de devolverlo o confirmarlo.</p>
  :<div className={styles.panel}><p>{installments?"Pagá con tarjeta de crédito en 2 o 3 cuotas.":"Pagá en Mercado Pago con dinero en cuenta, débito o crédito en un pago."} Reservamos tus productos hasta el {new Date(order.expiresAt).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires",dateStyle:"short",timeStyle:"short"})}. Si ya pagaste, esperá unos segundos: el pedido se confirma cuando Mercado Pago acredita el pago.</p>
  <MercadoPagoPayment orderId={order.id} mode={installments?"financiado":"contado"} total={order.total}/></div>}
 </>);
}
