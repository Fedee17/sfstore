import { HistoricalDetail } from "@/components/admin/commercial-history-ui";
import { getHistoricalCommercialRecord } from "@/services/commercial-history";
import Link from "next/link";
import { notFound } from "next/navigation";

import { cancelPurchaseDraftAction } from "@/app/admin/compras/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { ConfirmPurchaseForm } from "@/components/admin/purchases/confirm-purchase-form";
import { requireAdminSession } from "@/lib/admin-session";
import { getPurchaseById } from "@/services/purchases";
import { getPurchaseComposition, getComponentReceipt, listComponentRecipes } from "@/services/component-inventory";
import { ComponentCompositionForm } from "@/components/admin/purchases/component-composition-form";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});
const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const statusLabels = {
  draft: "Borrador",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};

type PurchaseDetailPageProps = { params: Promise<{ id: string }> };

export default async function PurchaseDetailPage({ params }: PurchaseDetailPageProps) {
  await requireAdminSession();
  const { id } = await params;
  const historical = await getHistoricalCommercialRecord("purchases",id);
  if(historical.purchase) return <HistoricalDetail purchase={historical.purchase}/>;
  const purchase = await getPurchaseById(id);

  if (!purchase) {
    notFound();
  }
  const recipes = purchase.status === "draft" ? await listComponentRecipes() : [];
  const recipe = recipes.find(r => purchase.purchase_items?.some(i => i.product_id === r.source_product));
  const composition = recipe ? await getPurchaseComposition(id) : null;
  const componentReceipt = purchase.status === "confirmed" ? await getComponentReceipt(id) : null;

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Link href="/admin/compras" className="text-sm font-semibold text-[#8B5E3C]">Volver a compras</Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">{statusLabels[purchase.status]}</p>
            <h1 className="mt-2 break-words text-4xl font-semibold">{purchase.supplier_name_snapshot}</h1>
            <p className="mt-2 text-sm text-[#1F1F1F]/60">Fecha: {purchase.purchase_date}</p>
            {purchase.confirmed_at ? (
              <p className="mt-1 text-sm font-medium text-[#556B2F]">
                Confirmada el {dateTimeFormatter.format(new Date(purchase.confirmed_at))}
              </p>
            ) : null}
          </div>
          {purchase.status === "draft" ? (
            <div className="flex flex-wrap gap-3">
              <Link href={`/admin/compras/${purchase.id}/editar`} className="rounded-full border border-[#556B2F]/30 px-5 py-3 text-sm font-semibold text-[#556B2F] transition hover:bg-[#556B2F]/10">Editar</Link>
              <form action={cancelPurchaseDraftAction}>
                <input type="hidden" name="purchaseId" value={purchase.id} />
                <PendingSubmitButton pendingLabel="Cancelando..." className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-sm font-semibold text-[#8B5E3C] transition hover:bg-[#8B5E3C]/10 disabled:cursor-not-allowed disabled:opacity-60">Cancelar borrador</PendingSubmitButton>
              </form>
              <ConfirmPurchaseForm purchaseId={purchase.id} />
            </div>
          ) : null}
        </div>

        {recipe ? <ComponentCompositionForm purchaseId={id} recipeId={recipe.id} quantity={purchase.purchase_items!.find(i => i.product_id === recipe.source_product)!.quantity} cc={composition?.cable_cc} lightning={composition?.cable_lightning}/> : null}
        {componentReceipt ? <section className="mt-6 grid gap-2 rounded-2xl border border-[#556B2F]/30 bg-white p-5 text-sm">
          <h2 className="text-xl font-semibold">Componentes recibidos · {componentReceipt.plan.physical_pieces} piezas físicas</h2>
          <p>La compra y los importes que figuran debajo conservan el registro original. El envío fue reclasificado entre las piezas; no se cobró nuevamente.</p>
          {componentReceipt.plan.allocations.map(a => <p key={a.key}>{a.key === "head" ? "Cabezales" : a.key === "cable-c-c" ? "Cables USB-C a USB-C" : a.key === "cable-c-lightning" ? "Cables USB-C a Lightning" : "Otros artículos de la compra"}: {a.quantity} · costo total del lote {currencyFormatter.format(a.total_cents / 100)} · residual de redondeo {currencyFormatter.format(a.residual_cents / 100)}</p>)}
          <p className="break-all text-xs">Operación auditable: {componentReceipt.operation_key}</p>
        </section> : null}
        <div className="mt-8 grid gap-4">
          {(purchase.purchase_items ?? []).map((item) => (
            <article key={item.id} className="grid gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div>
                <h2 className="break-words text-lg font-semibold">{item.product_name_snapshot}</h2>
                <p className="mt-1 text-sm text-[#1F1F1F]/60">{item.sku_snapshot ?? item.product_slug_snapshot} · {item.quantity} unidades</p>
              </div>
              <div className="text-sm md:text-right">
                <p>Costo proveedor unitario: <strong>{currencyFormatter.format(Number(item.unit_purchase_cost))}</strong></p>
                <p>Subtotal proveedor: <strong>{currencyFormatter.format(Number(item.supplier_line_total))}</strong></p>
                <p>Envio asignado: <strong>{currencyFormatter.format(Number(item.allocated_shipping_total))}</strong></p>
                <p>Costo efectivo unitario: <strong>{currencyFormatter.format(Number(item.effective_unit_cost))}</strong></p>
                <p>Total efectivo: <strong>{currencyFormatter.format(Number(item.effective_line_total))}</strong></p>
                {purchase.status === "confirmed" && purchase.total_units === 29 && purchase.purchase_items?.length === 2 && item.quantity === 20 && /cargador/i.test(item.product_name_snapshot) && purchase.purchase_items.some(other => other.id !== item.id && other.quantity === 9 && /vape/i.test(other.product_name_snapshot)) ? <Link className="mt-3 inline-block min-h-11 py-3 font-semibold text-[#556B2F] underline" href={`/admin/compras/${purchase.id}/componentes?line=${item.id}`}>Simular desglose de cargadores · solo lectura</Link> : null}
              </div>
            </article>
          ))}
        </div>

        <section className="mt-6 grid gap-2 rounded-[2rem] border border-[#556B2F]/20 bg-[#556B2F]/5 p-5 text-sm sm:grid-cols-2">
          <p>Unidades: <strong>{purchase.total_units}</strong></p>
          <p>Subtotal proveedor: <strong>{currencyFormatter.format(Number(purchase.supplier_subtotal))}</strong></p>
          <p>Envio: <strong>{currencyFormatter.format(Number(purchase.shipping_cost))}</strong></p>
          <p className="text-lg">Total: <strong>{currencyFormatter.format(Number(purchase.total_cost))}</strong></p>
          {purchase.notes ? <p className="sm:col-span-2">Notas: {purchase.notes}</p> : null}
        </section>
      </section>
    </main>
  );
}
