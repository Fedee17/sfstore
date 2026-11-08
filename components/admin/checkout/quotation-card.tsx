import { ShippingQuotationForm } from "@/components/admin/checkout-manual-forms";
import { checkoutDate, checkoutMoney } from "@/lib/admin/checkout-presentation";
import type { listShippingQuotationRequests } from "@/services/checkout-manual-admin";
import styles from "./checkout-admin.module.css";

type Quotation = Awaited<ReturnType<typeof listShippingQuotationRequests>>[number];
export function CheckoutQuotationCard({ quote }: { quote: Quotation }) {
  const customer=quote.request.customer, shipping=quote.request.shipping;
  return <article className={styles.card}>
    <div className={styles.cardHead}><div className={styles.identity}><span className={styles.badge} data-tone={quote.status==="requested"?"warning":"success"}>{quote.status==="requested"?"Envío por cotizar":"Cotización registrada"}</span><h2>{customer.fullName}</h2><p className={styles.muted}>{customer.phone}</p></div><p className={styles.muted}>{checkoutDate(quote.created_at)}</p></div>
    <dl className={styles.facts}><div><dt>Destino</dt><dd>{shipping.city}, {shipping.province}<br/>{shipping.address} · CP {shipping.postalCode}</dd></div><div><dt>Transporte preferido</dt><dd>{shipping.carrier || "Sin preferencia registrada"}</dd></div><div><dt>Estado del pedido</dt><dd>{quote.accepted_order_id?"Pedido creado":"Sin pedido ni reserva"}</dd></div></dl>
    <ul className={styles.products}>{quote.items.map(item=><li key={item.productId}>{item.quantity} × {item.name}</li>)}</ul>
    {quote.status==="requested"?<details className={styles.disclosure}><summary>Cargar costo de envío</summary><ShippingQuotationForm quoteId={quote.id}/></details>:<div className={styles.notice}>Envío: <strong>{checkoutMoney(quote.shipping_fee)}</strong> · Total: <strong>{checkoutMoney(quote.quoted_total)}</strong><br/>Válida hasta {checkoutDate(quote.valid_until)}. {quote.accepted_order_id?"Aceptada por el comprador.":"Pendiente de aceptación del comprador."}</div>}
  </article>;
}
