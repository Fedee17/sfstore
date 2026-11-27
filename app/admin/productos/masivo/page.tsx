import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { BULK_STATUS_LIMIT, parseBulkTarget, type BulkStatusPlan } from "@/lib/admin/bulk-status";
import { PRODUCT_STATUSES } from "@/lib/products/admin-product-policy";
import { productStatusLabel } from "@/lib/products/product-availability";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getAdminCategories, getAdminProducts } from "@/services/admin";
import { planFromRows } from "@/services/bulk-status";
import { applyBulkStatus } from "./actions";

type Params = Record<string, string | string[] | undefined>;
const one = (params: Params, key: string) => { const value = params[key]; return typeof value === "string" ? value.trim() : ""; };
const panel = "mt-6 min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm";
const field = "h-11 min-w-0 rounded-xl border border-[#8B5E3C]/30 bg-white px-3";
const ERRORS: Record<string, string> = {
  invalid: "La selección no es válida. No se cambió nada.",
  read: "No pudimos leer los productos. No se cambió nada.",
  changed: "Algunos productos cambiaron desde la vista previa. No se cambió nada: revisá la lista de nuevo.",
  write: "No se pudo guardar el cambio. No se cambió nada.",
};

export default async function BulkStatusPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminSession();
  const params = await searchParams;
  const search = one(params, "search"), category = one(params, "category"), status = parseBulkTarget(one(params, "status")) ?? "";
  const target = parseBulkTarget(one(params, "target"));
  const categories = await getAdminCategories();
  const query = new URLSearchParams({ search, category, status, target: target ?? "" }).toString();

  let plan: BulkStatusPlan | null = null, readError: string | null = null;
  if (target) {
    const products = await getAdminProducts({ search, category, status: status || undefined, requireComplete: true });
    if (products.error) readError = products.error;
    else {
      const rows = (products.data ?? []).filter(p => !p.component_offer).map(p => ({ id: p.id, name: p.name, sku: p.sku, slug: p.slug, status: p.status, historical_identity: p.historical_identity ?? null }));
      try { plan = await planFromRows(getSupabaseAdminClient(), rows, target); }
      catch { readError = "No pudimos verificar los combos de cargador."; }
    }
  }
  const done = Number(one(params, "done")), of = Number(one(params, "of")), error = ERRORS[one(params, "error")];

  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/admin/productos" className="text-sm font-semibold text-[#465826] underline">Volver a Productos</Link>
      <h1 className="mt-3 text-3xl font-semibold">Cambiar estado en lote</h1>
      <p className="mt-2 text-sm text-black/65">Elegí qué productos y a qué estado pasan. Primero ves la lista; nada cambia hasta que confirmes. Cada cambio queda en el historial de la ficha.</p>
      {one(params, "done") && Number.isInteger(done) ? <p role="status" className="mt-4 rounded-xl bg-[#556B2F]/10 p-3 text-sm font-semibold text-[#465826]">
        {`Se ${done === 1 ? "cambió" : "cambiaron"} ${done} de ${of} ${of === 1 ? "producto" : "productos"}.`}{done < of ? " Los demás cambiaron mientras tanto: revisalos en la lista." : ""}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}

      <form method="get" className={panel + " grid gap-3 sm:grid-cols-2"}>
        <label className="grid gap-1 text-sm font-semibold">Buscar<input name="search" defaultValue={search} maxLength={80} placeholder="Nombre, SKU o slug" className={field} /></label>
        <label className="grid gap-1 text-sm font-semibold">Categoría<select name="category" defaultValue={category} className={field}>
          <option value="">Todas</option>{(categories.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Estado actual<select name="status" defaultValue={status} className={field}>
          <option value="">Cualquiera</option>{PRODUCT_STATUSES.map(s => <option key={s} value={s}>{productStatusLabel(s)}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Pasar a<select name="target" defaultValue={target ?? ""} required className={field}>
          <option value="" disabled>Elegí un estado</option>{PRODUCT_STATUSES.map(s => <option key={s} value={s}>{productStatusLabel(s)}</option>)}</select></label>
        <button type="submit" className="min-h-11 rounded-xl bg-[#556B2F] px-5 font-semibold text-white sm:col-span-2 sm:justify-self-start">Ver vista previa</button>
      </form>

      {readError ? <p role="alert" className="mt-6 text-sm text-amber-900">{readError}</p> : null}
      {plan && target ? <>
        <section className={panel} aria-labelledby="bulk-change">
          <h2 id="bulk-change" className="text-lg font-semibold">Se van a cambiar a {productStatusLabel(target)}: {plan.change.length}</h2>
          {plan.tooMany ? <p role="alert" className="mt-2 text-sm text-amber-900">{`Son más de ${BULK_STATUS_LIMIT}. Acotá la búsqueda o la categoría; no se cambia una parte sola.`}</p>
            : plan.change.length ? <form action={applyBulkStatus} className="mt-3 grid gap-3">
              <input type="hidden" name="target" value={target} /><input type="hidden" name="returnQuery" value={query} />
              <ul className="grid gap-1">{plan.change.map(row => <li key={row.id}><label className="flex min-h-11 items-center gap-3 rounded-xl bg-[#F7F4ED] px-3 text-sm">
                <input type="checkbox" name="productId" value={row.id} defaultChecked className="h-5 w-5" />
                <span className="min-w-0 break-words"><strong>{row.name}</strong> <span className="text-black/60">· {row.sku || "Sin SKU"} · {productStatusLabel(row.status)} → {productStatusLabel(target)}</span></span></label></li>)}</ul>
              <p className="text-xs text-black/60">Destildá los que no quieras cambiar.</p>
              <button type="submit" className="min-h-11 justify-self-start rounded-xl bg-[#556B2F] px-5 font-semibold text-white">Confirmar cambio de estado</button>
            </form> : <p className="mt-2 text-sm text-black/65">Ningún producto de esta búsqueda necesita el cambio.</p>}
        </section>
        {plan.skip.length ? <section className={panel} aria-labelledby="bulk-skip">
          <h2 id="bulk-skip" className="text-lg font-semibold">No se cambian: {plan.skip.length}</h2>
          <ul className="mt-3 grid gap-1 text-sm">{plan.skip.map(({ row, reason }) => <li key={row.id} className="break-words"><strong>{row.name}</strong> <span className="text-black/60">· {reason}</span></li>)}</ul>
        </section> : null}
      </> : null}
    </section>
  </main>;
}
