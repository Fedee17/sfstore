import Link from "next/link";
import { getAdminProductPublications } from "@/services/admin";
import { availabilityRows, LOW_STOCK_LIMIT } from "@/lib/admin/catalog-review";
import { GetNavigationForm, GetNavigationSubmitButton } from "@/components/admin/get-navigation-form";

export async function InventoryAvailability({ search, stock }: { search: string; stock: string }) {
  const result = await getAdminProductPublications({ search: search || undefined, requireComplete: true });
  const rows = availabilityRows(result.data ?? [], stock);
  return <>
    <p className="mt-4 max-w-3xl text-sm leading-6">Disponibilidad registrada, de menor a mayor. «Stock bajo» usa el umbral actual de {LOW_STOCK_LIMIT} unidades; no es una recomendación de compra calculada.</p>
    <GetNavigationForm className="mt-6 grid gap-3 rounded-2xl border border-[#8B5E3C]/20 bg-white p-4 sm:flex sm:flex-wrap sm:items-end">
      <label className="grid min-w-0 flex-1 gap-2 text-sm font-semibold sm:min-w-56">Producto o SKU<input name="search" defaultValue={search} className="h-11 min-w-0 rounded-xl border px-3" /></label>
      <label className="grid gap-2 text-sm font-semibold">Disponibilidad<select name="stock" defaultValue={stock} className="h-11 rounded-xl border px-3"><option value="">Todos</option><option value="out">Sin stock</option><option value="low">Stock bajo (1 a 3)</option></select></label>
      <GetNavigationSubmitButton pendingLabel="Buscando..." className="min-h-11 rounded-xl bg-[#556B2F] px-4 font-semibold text-white">Consultar</GetNavigationSubmitButton>
    </GetNavigationForm>
    {result.error ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.error}</p> : <>
      <p className="mt-5 text-sm">{rows.length} publicaciones coincidentes. Los combos comparten componentes; sus cantidades no se suman al stock físico.</p>
      {!rows.length ? <p className="mt-5">No hay productos con estos filtros.</p> : <div className="mt-5 grid gap-2">{rows.map(product => <article key={product.id} className="grid min-w-0 gap-3 rounded-xl border border-[#8B5E3C]/20 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
        <div className="min-w-0"><h2 className="break-words font-semibold">{product.name}</h2><p className="break-words text-xs text-black/60">{product.sku || "Sin SKU"} · {product.status}{product.component_offer ? " · Combo por componentes" : ""}</p></div>
        <p className="font-semibold">{product.stock <= 0 ? "Sin stock" : `${product.stock} disponibles`}</p>
        <div className="flex flex-wrap gap-3 text-sm font-semibold"><Link className="inline-flex min-h-11 items-center underline" href={`/admin/productos/${product.id}/editar`}>Revisar</Link>{!product.component_offer ? <Link className="inline-flex min-h-11 items-center underline" href={`/admin/inventario?view=movements&product=${encodeURIComponent(product.id)}`}>Movimientos</Link> : null}</div>
      </article>)}</div>}
    </>}
    <Link href="/admin/compras/nueva" className="mt-6 inline-flex min-h-11 items-center rounded-full border border-[#556B2F]/30 px-5 font-semibold text-[#465826]">Cargar una compra</Link>
  </>;
}
