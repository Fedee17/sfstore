import type { CommercialAnalytics } from "@/lib/commercial-reporting/analytics";
import { displayCents } from "@/components/admin/commercial-history-ui";
import styles from "./sales-dashboard.module.css";

const monthLabel=(month:string,short=false)=>new Intl.DateTimeFormat("es-AR",{month:short?"short":"long",...(short?{}:{year:"numeric"}),timeZone:"UTC"}).format(new Date(month+"-01T12:00:00Z"));
const chartAmount=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",currencyDisplay:"narrowSymbol",notation:"compact",maximumFractionDigits:0});
export function SalesDashboard({analytics}:{analytics:CommercialAnalytics}) {
  const maximum=Math.max(1,...analytics.trend.map(row=>row.confirmedSalesCents));
  const top=analytics.products[0];
  const tie=top&&analytics.products.filter(product=>product.quantity===top.quantity).length>1;
  return <>
    <div className={styles.dashboard}>
      <section className={styles.panel} aria-labelledby="sales-trend-title"><h2 id="sales-trend-title">Cómo vienen las ventas</h2><p className={styles.muted}>Importe de ventas confirmadas por mes</p><p className={styles.total}>{displayCents(analytics.report.totals.confirmedSalesCents)}</p><p className={styles.muted}>{monthLabel(analytics.report.month)} · {analytics.counts.confirmed} ventas confirmadas</p>
        <ol className={styles.chart} aria-label="Ventas confirmadas de los últimos seis meses">{analytics.trend.map(row=><li key={row.month} aria-label={`${monthLabel(row.month)}: ${displayCents(row.confirmedSalesCents)}`} title={displayCents(row.confirmedSalesCents)}><div className={styles.plot} aria-hidden="true"><span className={styles.bar} style={{height:row.confirmedSalesCents?`${Math.max(2,row.confirmedSalesCents/maximum*100)}%`:"0"}}/></div><span className={styles.month} aria-hidden="true">{monthLabel(row.month,true)}</span><span className={styles.value} aria-hidden="true">{chartAmount.format(row.confirmedSalesCents/100)}</span></li>)}</ol>
      </section>
      <section className={styles.panel} aria-labelledby="sales-product-title"><h2 id="sales-product-title">Lo más vendido del mes</h2><p className={styles.muted}>{monthLabel(analytics.report.month)} · por unidades vendidas</p>{top?<><p className={styles.product}>{top.name}</p><span className={styles.quantity}>{top.quantity} unidades</span>{tie?<p className={styles.muted}>Hay productos empatados en unidades vendidas.</p>:null}{analytics.products.length>1?<ol className={styles.ranking} start={2}>{analytics.products.slice(1,3).map(product=><li key={product.key}>{product.name} · <strong>{product.quantity} unidades</strong></li>)}</ol>:null}</>:<p className={styles.product}>Todavía no hay ventas confirmadas en este mes.</p>}</section>
    </div>
    <p className={styles.note}>Los paneles usan el mes elegido y no cambian al filtrar el historial. Las pruebas identificadas están excluidas. {analytics.comparison.selectedMonthNotClosed?"El mes está en curso.":""}</p>
  </>;
}
