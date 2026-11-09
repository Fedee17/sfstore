import Link from 'next/link';
import {displayCents} from '@/components/admin/commercial-history-ui';
import {STOCK_PREVIEW_LIMIT,type StockHealth,type StockHealthRow} from '@/lib/admin/stock-health';
import styles from './sales-dashboard.module.css';

const day=(value:string)=>value.split('-').reverse().join('/');
const coverage=new Intl.NumberFormat('es-AR',{style:'unit',unit:'day',unitDisplay:'long',maximumFractionDigits:1,roundingMode:'floor'});

function StockRow({row,risk}:{row:StockHealthRow;risk:boolean}) {
  return <li className={styles.stockRow}>
    <div className={styles.stockIdentity}><h3>{row.name}</h3>{row.variant_label||row.status!=='active'?<p className={styles.muted}>{row.variant_label}{row.status!=='active'?' · No publicado':''}</p>:null}</div>
    <p className={styles.stockMetric}>{risk?(row.available===0?'Sin stock · Tuvo ventas en los últimos 30 días':`${row.available===1?'Queda 1':`Quedan ${row.available}`} · Alcanza para ${row.coverageDays!<0.1?'menos de 0,1 días':coverage.format(row.coverageDays!)}`):`${row.available} disponibles · ${row.retainedCents===null?'Costo sin cargar':`${displayCents(row.retainedCents)} en mercadería`}`}</p>
    <Link className={risk?styles.stockAction:styles.stockLink} aria-label={`${risk?'Revisar stock':'Ver producto'}: ${row.name}${row.variant_label?` · ${row.variant_label}`:''}`} href={risk?`/admin/inventario?view=movements&product=${encodeURIComponent(row.id)}`:`/admin/productos/${row.id}/editar`}>{risk?'Revisar stock':'Ver producto'}</Link>
  </li>;
}
function StockList({rows,risk}:{rows:StockHealthRow[];risk:boolean}) {
  return <>
    <ol className={styles.stockList}>{rows.slice(0,STOCK_PREVIEW_LIMIT).map(row=><StockRow key={row.id} row={row} risk={risk}/>)}</ol>
    {rows.length>STOCK_PREVIEW_LIMIT?<details className={styles.stockMore}><summary><span className={styles.whenClosed}>Ver más productos</span><span className={styles.whenOpen}>Mostrar menos</span></summary><ol className={styles.stockList} start={STOCK_PREVIEW_LIMIT+1}>{rows.slice(STOCK_PREVIEW_LIMIT).map(row=><StockRow key={row.id} row={row} risk={risk}/>)}</ol></details>:null}
  </>;
}
export function StockHealthDashboard({health}:{health:StockHealth|null}) {
  if(!health) return <section className={`${styles.panel} ${styles.stockSection}`} aria-labelledby="stock-health-title"><h2 id="stock-health-title">Stock: qué revisar hoy</h2><p role="alert" className={styles.muted}>No pudimos consultar el stock. Recargá para reintentar.</p></section>;
  return <section className={styles.stockSection} aria-labelledby="stock-health-title">
    <h2 id="stock-health-title" className={styles.stockTitle}>Stock: qué revisar hoy</h2>

    <div className={styles.stockPanels}>
      <section className={`${styles.panel} ${styles.stockPanel}`} aria-labelledby="stock-risk-title"><div className={styles.stockHeading}><h2 id="stock-risk-title">Necesitás reponer</h2><span className={`${styles.stockCount} ${health.risk.length?styles.stockRiskCount:' '}`}>{health.risk.length} {health.risk.length===1?'producto':'productos'}</span></div><p className={styles.muted}>Estos productos podrían agotarse pronto.</p>{health.risk.length?<StockList rows={health.risk} risk/>:<p className={styles.stockEmpty}>No hay productos que necesiten reposición según las ventas registradas.</p>}</section>
      <section className={`${styles.panel} ${styles.stockPanel}`} aria-labelledby="stock-idle-title"><div className={styles.stockHeading}><h2 id="stock-idle-title">Revisá estos productos</h2><span className={styles.stockCount}>{health.idle.length} {health.idle.length===1?'producto':'productos'}</span></div><p className={styles.muted}>Tienen stock y no registran ventas hace 60 días.</p>{health.idle.length?<StockList rows={health.idle} risk={false}/>:<p className={styles.stockEmpty}>No hay productos con stock que lleven 60 días sin ventas registradas.</p>}<p className={styles.note}>No incluye productos incorporados en los últimos 30 días.</p></section>
    </div>
    <details className={styles.stockDetails}><summary>Cómo se calcula y detalle del stock</summary>
    <p className={styles.note}>Actualizado {day(health.to)} · Independiente del mes del gráfico.</p><p className={styles.note}>Reposición: menos de 10 días estimados según ventas del {day(health.from)} al {day(health.to)}. Sin movimiento: sin ventas del {day(health.idleFrom)} al {day(health.to)}. Valor a costo vigente: {health.idle.length>0&&health.unknownCostItems===health.idle.length?'Sin costos confirmados':displayCents(health.retainedCents)}.{health.unknownCostItems?` ${health.unknownCostItems} sin costo, fuera del total.`:''}</p>
    <p className={styles.note}>El saldo disponible ya descuenta las reservas; no se restan dos veces. El físico registrado no reemplaza un recuento. Los combos se cuentan por componentes, sin duplicar existencias. Las ventas y el stock se consultan por separado y pueden cambiar mientras operás.</p>
    {health.unverifiedHistoricalSales||health.unidentifiedLines?<p className={styles.note}>Cobertura limitada: {health.unverifiedHistoricalSales} ventas históricas sin fecha corroborada y {health.unidentifiedLines} líneas sin vínculo a un producto actual no aportan al cálculo. {health.uncertainExcluded} productos fuera del capital por fechas sin corroborar. La falta de ventas registradas no prueba ausencia de ventas reales.</p>:null}
    <ul className={styles.stockTechnical}>{[...health.risk,...health.idle].map(row=><li key={row.id}><strong>{row.name}</strong> · {row.sku||'Sin SKU'}{row.variant_label?` · ${row.variant_label}`:''}: {row.available} disponibles · {row.reserved} reservados · {row.physical} físico registrado</li>)}</ul>
    </details>
  </section>;
}
