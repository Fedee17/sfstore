import type { ChargerComponentPlan } from "@/lib/purchases/charger-components";
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const money = (v: number) => currency.format(v / 100);
const labels: Record<string, string> = { head: "Cabezales nuevos", "cable-c-c": "Cable USB-C a USB-C", "cable-c-lightning": "Cable USB-C a Lightning", other: "Vapers · otra línea de la compra" };

export function ChargerComponentsPreview({ plan }: { plan: ChargerComponentPlan }) {
  return <section className="space-y-5" aria-label="Conciliación de componentes">
    <p className="rounded-2xl border border-[#8B5E3C]/30 p-4 text-sm font-semibold">Simulación de solo lectura. Compra, inventario y costos vigentes intactos. Precios de venta pendientes de aprobación.</p>
    <p className="text-sm">La compra conserva sus 29 unidades comerciales. Las 49 piezas se usan únicamente para conciliar el envío: 20 cabezales, 20 cables y 9 vapers.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {[ ["Piezas para distribuir envío", String(plan.physicalPieces)], ["Envío total, una sola vez", money(plan.original.shipping)], ["Adquisición conservada", money(plan.original.total)] ].map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl bg-white/80 p-4"><p className="text-xs">{label}</p><p className="mt-2 break-words text-lg font-semibold">{value}</p></div>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">{plan.lines.map(line => <article key={line.key} className="min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-white/70 p-4">
      <h2 className="font-semibold">{labels[line.key]}</h2>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {[["Unidades", String(line.quantity)], ["Costo proveedor asignado", money(line.supplier)], ["Envío propuesto", money(line.shipping)], ["Total exacto del lote", money(line.total)], ["Costo unitario redondeado del lote", money(line.unit)], ["Residual a conservar", money(line.residual)]].map(([label, value]) => <div key={label} className="min-w-0"><dt>{label}</dt><dd className="break-words font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
    </article>)}</div>
    <div className="space-y-2 rounded-2xl border border-[#556B2F]/30 p-4 text-sm">
      <h2 className="font-semibold">Reclasificación propuesta, no un gasto nuevo</h2>
      <p>Componentes: {money(plan.original.source.total)} → {money(plan.componentTotal)} ({money(plan.componentReclassification)}).</p>
      <p>Vapers: {money(plan.original.other.total)} → {money(plan.otherTotal)} ({money(plan.otherReclassification)}). No modifica sus unidades.</p>
      <p>Los ajustes se compensan: total de la compra {money(plan.original.total)}. La compra confirmada conservará sus líneas y el prorrateo original.</p>
    </div>
    <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-2">Cómo conservar los redondeos y el historial</summary><div className="space-y-2 leading-6">
      <p>Residual = total exacto del lote − costo unitario redondeado × unidades. Se conserva como evidencia de costo; no se convierte en envío adicional ni se oculta ajustando precios.</p>
      <p>Residual original: {money(plan.originalUnitResidual)}. Residual propuesto: {money(plan.unitResidual)}. Comparar sólo costos unitarios multiplicados no conserva los centavos de adquisición.</p>
      <p>El cabezal reutilizado tendrá 21 unidades: una anterior y 20 nuevas. Los costos mostrados corresponden al lote nuevo, no recalculan el historial de la unidad anterior.</p>
      <p>Antes de una conversión futura se verificarán movimientos, reservas, costo fuente y si las nueve unidades de vapers siguen disponibles. Si hubo ventas o cambió el lote, se detiene la ejecución y se concilia la diferencia; no se reescriben costos históricos ni se aplica un costo nuevo a ciegas.</p>
      <p>La conversión y su reclasificación necesitan registro transaccional, autorización específica y clave idempotente. Esta pantalla no ejecuta ni prepara escrituras en Supabase.</p>
    </div></details>
    <p className="break-all text-xs text-[#1F1F1F]/70">Huella de la propuesta: {plan.fingerprint}</p>
  </section>;
}
