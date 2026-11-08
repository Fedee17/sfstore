import { ReleaseCheckoutReservationsForm } from "@/components/admin/checkout-manual-forms";
import type { CheckoutExpirationHealth } from "@/services/checkout-manual-admin";
import { checkoutDate } from "@/lib/admin/checkout-presentation";
import styles from "./checkout-admin.module.css";

export function ReservationMonitor({ health }: { health: CheckoutExpirationHealth | null }) {
  return <section className={styles.panel} aria-label="Supervisión de reservas">
    <h2 className="text-xl font-semibold">Control de reservas</h2>
    {!health?<p role="alert" className={styles.notice} data-tone="warning">No se pudo consultar el estado. Actualizá la pantalla antes de operar.</p>:<>
      <dl className={styles.facts}><div><dt>Vencidas para liberar</dt><dd>{health.due}</dd></div><div><dt>Con pago informado, protegidas</dt><dd>{health.protectedReports}</dd></div><div><dt>Última ejecución</dt><dd>{checkoutDate(health.lastProgressAt)}</dd></div></dl>
      <p className={styles.muted}>{health.monitoringEnabled?`Ejecución automática configurada cada ${health.intervalSeconds} segundos.`:"La ejecución automática no está activada."}</p>
      {health.heartbeatOverdue||health.backlogOverdue||["partial","failed"].includes(health.lastRunStatus??"")?<p role="alert" className={styles.notice} data-tone="warning">Hay atrasos o errores que requieren revisión. Consultá las últimas ejecuciones antes de continuar.</p>:null}
      <details className={styles.disclosure}><summary>Últimas ejecuciones</summary>{health.recentRuns.length?<ol className={styles.history}>{health.recentRuns.map((run,index)=><li key={index}>{checkoutDate(run.finished_at)} · {run.status} · Liberadas: {run.released} · Pendientes: {run.due_after} · Errores: {run.failed_orders}</li>)}</ol>:<p className={styles.muted}>Sin ejecuciones registradas.</p>}</details>
    </>}
    <details className={styles.disclosure}><summary>Liberar reservas vencidas manualmente</summary><ReleaseCheckoutReservationsForm/></details>
  </section>;
}
