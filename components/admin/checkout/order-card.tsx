import Link from "next/link";
import { ManualCheckoutPaymentForm, RejectCheckoutPaymentForm, CheckoutBuyerExceptionForm } from "@/components/admin/checkout-manual-forms";
import { checkoutDate, checkoutMoney, checkoutOrderState } from "@/lib/admin/checkout-presentation";
import type { AdminCheckoutRow } from "@/services/checkout-manual-admin";
import styles from "./checkout-admin.module.css";

export function CheckoutOrderCard({ order }: { order: AdminCheckoutRow }) {
  const state = checkoutOrderState(order);
  const method = order.result.paymentMethod === "transfer" ? "Transferencia" : order.result.paymentMethod === "cash" ? "Efectivo" : "Medio no registrado";
  return <article className={styles.card}>
    <div className={styles.cardHead}>
      <div className={styles.identity}><span className={styles.badge} data-tone={state.tone}>{state.label}</span><h2>{order.result.orderNumber}</h2></div>
      <div className={styles.amount}><span>Total del pedido</span><strong>{checkoutMoney(order.result.total)}</strong></div>
    </div>
    <dl className={styles.facts}>
      <div><dt>Comprador</dt><dd>{order.customer?.name || "Nombre no registrado"}{order.customer?.phone ? <span className="block mt-1 font-normal">{order.customer.phone}</span> : null}</dd></div>
      <div><dt>Medio de pago</dt><dd>{method}</dd></div>
      <div><dt>{order.report?.status === "pending" ? "Pago informado" : "Reserva hasta"}</dt><dd>{checkoutDate(order.report?.status === "pending" ? order.report.reported_at : order.expires_at)}</dd></div>
    </dl>
    {order.items?.length ? <ul className={styles.products}>{order.items.map((item, index) => <li key={index}>{item.quantity} × {item.product_name}</li>)}</ul> : <p className={styles.muted}>No se recuperó el detalle de productos.</p>}
    {order.report?.overdue && state.canCredit ? <p className={styles.notice} data-tone="warning">Este aviso superó el plazo de revisión. La reserva sigue protegida hasta que tomes una decisión.</p> : null}
    {state.canCredit ? <div className={styles.notice}>{order.report?.status === "pending" ? "Revisá el comprobante y verificá el ingreso en tu banco antes de acreditar." : "Todavía no hay un aviso de pago en revisión. Podés acreditar si verificaste el ingreso completo en el banco."}</div> : null}
    <div className={styles.actions}>
      {order.report?.status && order.report.status !== "uploading" ? <Link href={`/api/checkout/payment-proof/${order.order_id}`} prefetch={false} download className={styles.secondary}>Descargar comprobante</Link> : null}
    </div>
    {state.canCredit ? <details className={styles.disclosure}><summary>Revisar y acreditar pago</summary><ManualCheckoutPaymentForm order={order}/></details> : null}
    {state.canReject ? <details className={styles.disclosure}><summary>El pago no se acreditó: rechazar aviso</summary><RejectCheckoutPaymentForm orderId={order.order_id}/></details> : null}
    {order.report?.rejection_reason ? <p className={styles.notice}>Motivo del rechazo: {order.report.rejection_reason}</p> : null}
    <details className={styles.disclosure}><summary>Historial y herramientas</summary>
      <p className={styles.muted}>Reserva: {checkoutDate(order.expires_at)} · Fechas en horario argentino.</p>
      {order.history.length ? <ol className={styles.history}>{order.history.map((entry,index)=><li key={index}><strong>{checkoutDate(entry.created_at)}</strong> · {entry.event}<details><summary>Detalle técnico</summary><code>{JSON.stringify(entry.details,null,2)}</code></details></li>)}</ol> : <p className={styles.muted}>No hay acciones en el historial consultado.</p>}
      <CheckoutBuyerExceptionForm buyerId={order.buyer_id}/>
    </details>
  </article>;
}
