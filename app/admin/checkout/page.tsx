import Link from "next/link";
import { requireAdminSession } from "@/lib/admin-session";
import { listManualCheckoutOrders, listShippingQuotationRequests, getCheckoutExpirationHealth, type AdminCheckoutRow } from "@/services/checkout-manual-admin";
import { AdminNav } from "@/components/admin/admin-nav";
import { CheckoutOrderCard } from "@/components/admin/checkout/order-card";
import { CheckoutQuotationCard } from "@/components/admin/checkout/quotation-card";
import { ReservationMonitor } from "@/components/admin/checkout/reservation-monitor";
import { CheckoutRefreshButton } from "@/components/admin/checkout/refresh-button";
import styles from "@/components/admin/checkout/checkout-admin.module.css";

const inboxes = {
  payments: { label: "Pagos para revisar", description: "Verificá las transferencias informadas por los compradores.", empty: "No hay avisos de pago en esta página", help: "Los avisos aparecen cuando el comprador informa su transferencia. Para acreditar un ingreso sin aviso, buscá el pedido en la bandeja Pedidos." },
  quotes: { label: "Cotizaciones de envío", description: "Cargá el costo verificado para que el comprador pueda aceptar el total.", empty: "No hay cotizaciones en la consulta actual", help: "Las solicitudes de envío aparecerán acá. Una cotización todavía no es un pedido ni reserva stock." },
  orders: { label: "Pedidos", description: "Consultá productos, importes y estado de los pedidos de la tienda online.", empty: "No hay pedidos en esta página", help: "Los pedidos creados en el checkout aparecerán acá con su estado de pago y reserva." },
  monitor: { label: "Reservas", description: "Revisá vencimientos y ejecuciones del control de reservas.", empty: "", help: "" },
};
type Inbox = keyof typeof inboxes;
export default async function CheckoutAdministrationPage({ searchParams }: { searchParams?: Promise<{ page?: string; view?: string }> }) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  const view: Inbox = Object.hasOwn(inboxes, params.view ?? "") ? params.view as Inbox : "payments";
  const rawPage = Number(params.page ?? 0);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 && rawPage <= 10000 ? rawPage : 0;
  let orders: AdminCheckoutRow[] = [];
  let quotations: Awaited<ReturnType<typeof listShippingQuotationRequests>> = [];
  let readError = false;
  const health = await getCheckoutExpirationHealth().catch(() => null);
  try {
    if (view === "orders" || view === "payments") orders = await listManualCheckoutOrders(page, view === "payments");
    if (view === "quotes") quotations = await listShippingQuotationRequests();
  } catch { readError = true; }
  const visibleOrders = view === "payments" ? orders.filter(order => order.report?.status === "pending") : orders;
  const count = view === "quotes" ? quotations.length : visibleOrders.length;
  const attention = !health || health.heartbeatOverdue || health.backlogOverdue || ["partial", "failed"].includes(health.lastRunStatus ?? "");
  const inbox = inboxes[view];
  return <main className={styles.page}><AdminNav/><section className={styles.shell}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>Tienda online</p><h1 className={styles.title}>Pedidos web</h1><p className={styles.muted}>Revisá pagos, resolvé envíos y seguí cada pedido.</p></div><CheckoutRefreshButton/></header>
    <nav aria-label="Bandejas de pedidos web" className={styles.tabs}>{(Object.entries(inboxes) as [Inbox,typeof inbox][]).map(([key,value])=><Link key={key} href={`/admin/checkout?view=${key}`} aria-current={view===key?"page":undefined} className={styles.tab}>{value.label}</Link>)}</nav>
    {view!=="monitor"&&attention?<p role="alert" className={styles.notice} data-tone="warning">{health?"El control de reservas requiere revisión.":"No se pudo consultar el control de reservas."} <Link href="/admin/checkout?view=monitor" className="font-semibold underline">Revisar reservas</Link></p>:null}
    <div className={styles.sectionHead}><div><h2>{inbox.label}</h2><p className={styles.muted}>{inbox.description}</p></div>{view!=="monitor"&&!readError?<p className={styles.muted}>{count} en esta {view==="quotes"?"consulta":"página"}</p>:null}</div>
    {view==="monitor"?<ReservationMonitor health={health}/>:readError?<div role="alert" className={styles.panel}><h2 className="text-xl font-semibold">No pudimos cargar esta bandeja</h2><p className={styles.muted}>Actualizá para reintentar. No se muestran resultados parciales.</p></div>:count===0?<div className={styles.empty}><div className={styles.emptyMark} aria-hidden="true">✓</div><h2>{inbox.empty}</h2><p className={styles.muted}>{inbox.help}</p>{view!=="orders"?<Link href="/admin/checkout?view=orders" className={styles.secondary}>Ver pedidos</Link>:<CheckoutRefreshButton/>}</div>:<div className={styles.list}>{view==="quotes"?quotations.map(quote=><CheckoutQuotationCard key={quote.id} quote={quote}/>):visibleOrders.map(order=><CheckoutOrderCard key={order.order_id} order={order}/>)}</div>}
    {(view==="orders"||view==="payments")&&!readError?<nav aria-label="Paginación de pedidos web" className={styles.pagination}><p className={styles.muted}>Página {page+1} · hasta 100 registros</p><div className={styles.actions}>{page>0?<Link className={styles.secondary} href={`/admin/checkout?view=${view}&page=${page-1}`} prefetch={false}>Anterior</Link>:null}{orders.length===100?<Link className={styles.secondary} href={`/admin/checkout?view=${view}&page=${page+1}`} prefetch={false}>Siguiente</Link>:null}</div></nav>:null}
  </section></main>;
}
