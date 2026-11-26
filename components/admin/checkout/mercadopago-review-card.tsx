import { MercadoPagoReviewResolutionForm } from "@/components/admin/checkout-manual-forms";
import { checkoutDate, checkoutMoney } from "@/lib/admin/checkout-presentation";
import type { MercadoPagoReview } from "@/services/checkout-manual-admin";
import styles from "./checkout-admin.module.css";

const methods: Record<string, string> = { account_money: "Dinero en cuenta", debit_card: "Débito", credit_card: "Crédito" };

// A Mercado Pago charge that did not confirm its order. The store never refunds by itself: the administrator refunds
// (or decides) in Mercado Pago and records it here.
export function MercadoPagoReviewCard({ review }: { review: MercadoPagoReview }) {
  const refund = review.review_kind === "refund";
  const order = review.orders;
  return <article className={styles.card}>
    <div className={styles.cardHead}><div className={styles.identity}>
      <span className={styles.badge} data-tone={review.resolved_at ? "success" : "warning"}>{review.resolved_at ? "Resuelto" : refund ? "Requiere devolución" : "Requiere revisión"}</span>
      <h2>{order ? `Pedido ${order.order_number}` : "Pago sin pedido asociado"}</h2>
      <p className={styles.muted}>{order?.customers ? `${order.customers.full_name} · ${order.customers.phone}` : "Sin datos del comprador"}</p>
    </div><p className={styles.muted}>{checkoutDate(review.created_at)}</p></div>
    <p className={styles.notice} data-tone={review.resolved_at ? undefined : "warning"}>{review.reason ?? "Pago no coincidente."}{order ? ` Estado del pedido: ${order.payment_status === "paid" ? "pagado con otro pago" : "sin pago confirmado"}. El stock y la venta no se modificaron por este pago.` : ""}</p>
    <dl className={styles.facts}>
      <div><dt>Importe cobrado por Mercado Pago</dt><dd>{review.amount ? checkoutMoney(review.amount) : "No informado"}{order ? ` (pedido: ${checkoutMoney(order.total)})` : ""}</dd></div>
      <div><dt>Medio</dt><dd>{review.method ? methods[review.method] ?? review.method : "No informado"}{review.installments ? ` · ${review.installments} ${review.installments === 1 ? "cuota" : "cuotas"}` : ""}</dd></div>
      <div><dt>Identificador en Mercado Pago</dt><dd>{review.provider_payment_id}</dd></div>
    </dl>
    {review.resolved_at
      ? <p className={styles.muted}>Resuelto el {checkoutDate(review.resolved_at)}: {review.resolution}</p>
      : <details className={styles.disclosure}><summary>{refund ? "Registrar la devolución" : "Registrar la decisión"}</summary>
          <p className={styles.muted}>{refund ? "Devolvé el importe completo desde la actividad de Mercado Pago buscando este identificador. La tienda no devuelve dinero automáticamente." : "Revisá el pago en Mercado Pago y decidí con el comprador. La tienda no confirma pedidos ni devuelve dinero automáticamente."}</p>
          <MercadoPagoReviewResolutionForm paymentId={review.provider_payment_id} refund={refund} /></details>}
  </article>;
}
