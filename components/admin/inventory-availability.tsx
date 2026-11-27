import Link from "next/link";
import { getAdminProductPublications } from "@/services/admin";
import { getStockCoverage } from "@/services/commercial-history";
import { availabilityRows, LOW_STOCK_LIMIT, stockAdjustmentHref } from "@/lib/admin/catalog-review";
import { coverageDaysLabel, STOCK_RISK_DAYS, type StockCoverage } from "@/lib/admin/stock-health";
import { GetNavigationForm, GetNavigationSubmitButton } from "@/components/admin/get-navigation-form";
import { internalInventoryHref } from "@/lib/admin/internal-inventory";

function CoverageNote({ coverage, stock }: { coverage?: StockCoverage; stock: number }) {
  if (!coverage) return null;
  if (!coverage.soldUnits) return <p className="text-xs text-black/60">Sin ventas en los últimos 30 días</p>;
  if (stock <= 0) return <p className="text-xs font-semibold text-red-800">Agotado · tuvo ventas en los últimos 30 días</p>;
  return <p className={`text-xs ${coverage.risk ? "font-semibold text-red-800" : "text-black/60"}`}>Alcanza para {coverageDaysLabel(coverage.coverageDays!)} al ritmo de los últimos 30 días</p>;
}

export async function InventoryAvailability({ search, stock }: { search: string; stock: string }) {
  // Coverage is advisory: if sales cannot be read, availability still shows and nothing is claimed to run out.
  const [result, coverage] = await Promise.all([
    getAdminProductPublications({ search: search || undefined, requireComplete: true }),
    getStockCoverage().catch(() => null),
  ]);
  const rows = availabilityRows(result.data ?? [], stock, coverage);
  return <>
    <p className="mt-4 max-w-3xl text-sm leading-6">Disponibilidad registrada, de menor a mayor. «Stock bajo» usa el umbral actual de {LOW_STOCK_LIMIT} unidades. Los días que alcanza el stock se estiman con las ventas confirmadas de los últimos 30 días; no son una recomendación de compra.</p>
    {coverage ? null : <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No pudimos calcular cuántos días alcanza el stock. La disponibilidad se muestra igual; recargá para reintentar.</p>}
    <GetNavigationForm className="mt-6 grid gap-3 rounded-2xl border border-[#8B5E3C]/20 bg-white p-4 sm:flex sm:flex-wrap sm:items-end">
      <label className="grid min-w-0 flex-1 gap-2 text-sm font-semibold sm:min-w-56">Producto o SKU<input name="search" defaultValue={search} className="h-11 min-w-0 rounded-xl border px-3" /></label>
      <label className="grid gap-2 text-sm font-semibold">Disponibilidad<select name="stock" defaultValue={stock} className="h-11 rounded-xl border px-3"><option value="">Todos</option><option value="out">Sin stock</option><option value="low">Stock bajo (1 a {LOW_STOCK_LIMIT})</option><option value="risk">Por agotarse (menos de {STOCK_RISK_DAYS} días)</option></select></label>
      <GetNavigationSubmitButton pendingLabel="Buscando..." className="min-h-11 rounded-xl bg-[#556B2F] px-4 font-semibold text-white">Consultar</GetNavigationSubmitButton>
    </GetNavigationForm>
    {result.error ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.error}</p> : <>
      <p className="mt-5 text-sm">{rows.length} publicaciones coincidentes. Los combos comparten componentes; sus cantidades no se suman al stock físico.</p>
      {!rows.length ? <p className="mt-5">No hay productos con estos filtros. Para abrir una ficha interna, buscá el producto en <Link className="underline" href="/admin/productos?availability=historical">Identidades históricas</Link>.</p> : <div className="mt-5 grid gap-2">{rows.map(product => {
        const internalHref = internalInventoryHref(product);
        return <article key={product.id} className="grid min-w-0 gap-3 rounded-xl border border-[#8B5E3C]/20 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
        <div className="min-w-0"><h2 className="break-words font-semibold">{product.name}</h2><p className="break-words text-xs text-black/60">{product.sku || "Sin SKU"} · {product.status}{product.component_offer ? " · Combo por componentes" : ""}</p></div>
        <div className="grid gap-1"><p className="font-semibold">{product.stock <= 0 ? "Sin stock" : `${product.stock} disponibles`}</p>{product.component_offer ? null : <CoverageNote coverage={coverage?.get(product.id)} stock={product.stock} />}</div>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          {internalHref ? <Link className="inline-flex min-h-11 items-center underline" href={internalHref}>Inventario interno</Link> : <>
            <Link className="inline-flex min-h-11 items-center underline" href={`/admin/productos/${product.id}/editar`}>Revisar</Link>
            {!product.component_offer ? <Link className="inline-flex min-h-11 items-center underline" href={stockAdjustmentHref(product)}>Ajustar stock</Link> : null}
          </>}
          {!product.component_offer ? <Link className="inline-flex min-h-11 items-center underline" href={`/admin/inventario?view=movements&product=${encodeURIComponent(product.id)}`}>Movimientos</Link> : null}
        </div>
      </article>})}</div>}
    </>}
    <Link href="/admin/compras/nueva" className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[#556B2F]/30 px-5 font-semibold text-[#465826]">Cargar una compra</Link>
  </>;
}
