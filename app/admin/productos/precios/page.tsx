import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { AutomaticCashLine, PriceMoveLine, roundingLabel } from "@/components/admin/price-move";
import { BULK_PRICE_LIMIT, parsePercent, type BulkPricePlan } from "@/lib/admin/bulk-price";
import { PRODUCT_STATUSES } from "@/lib/products/admin-product-policy";
import { productStatusLabel } from "@/lib/products/product-availability";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getAdminCategories, getAdminProducts } from "@/services/admin";
import { planPriceFromRows, priceFingerprint, readPriceRows } from "@/services/bulk-price";
import { applyBulkPrice } from "./actions";

type Params = Record<string, string | string[] | undefined>;
const one = (params: Params, key: string) => { const value = params[key]; return typeof value === "string" ? value.trim() : ""; };
const panel = "mt-6 min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm";
const field = "h-11 min-w-0 rounded-xl border border-[#8B5E3C]/30 bg-white px-3";
const ERRORS: Record<string, string> = {
  invalid: "La selección o el porcentaje no son válidos. No se cambió ningún precio.",
  read: "No pudimos leer los productos. No se cambió ningún precio.",
  changed: "Algún precio cambió desde la vista previa. No se cambió ningún precio: revisá la lista de nuevo.",
  write: "No se pudo guardar el ajuste. No se cambió ningún precio.",
};

export default async function BulkPricePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminSession();
  const params = await searchParams;
  const search = one(params, "search"), category = one(params, "category");
  const status = (PRODUCT_STATUSES as readonly string[]).includes(one(params, "status")) ? one(params, "status") : "";
  const percentText = one(params, "percent"), bp = parsePercent(percentText);
  const categories = await getAdminCategories();
  const query = new URLSearchParams({ search, category, status, percent: percentText }).toString();

  let plan: BulkPricePlan | null = null, readError: string | null = null;
  if (bp !== null) {
    const products = await getAdminProducts({ search, category, status: status || undefined, requireComplete: true });
    if (products.error) readError = products.error;
    else {
      try {
        const client = getSupabaseAdminClient();
        plan = await planPriceFromRows(client, await readPriceRows(client, (products.data ?? []).filter(p => !p.component_offer).map(p => p.id)), bp);
      } catch { readError = "No pudimos leer los precios actuales."; }
    }
  }
  const done = one(params, "done"), error = ERRORS[one(params, "error")];
  const total = plan?.roundingCents ?? 0;

  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/admin/productos" className="text-sm font-semibold text-[#465826] underline">Volver a Productos</Link>
      <h1 className="mt-3 text-3xl font-semibold">Ajustar precios por porcentaje</h1>
      <p className="mt-2 text-sm text-black/65">Sube o baja el precio lista y el precio especial aprobado con el mismo porcentaje, redondeados al $100 más cercano. Sin especial aprobado, el precio en un pago sigue siendo el 75% de la lista. Primero ves el resultado; nada cambia hasta que confirmes. Cada cambio queda en el historial de la ficha. Las variantes de familia se ajustan en <Link href="/admin/productos/familias/precios" className="font-semibold text-[#465826] underline">precios de familias</Link>.</p>
      {done && Number.isInteger(Number(done)) ? <p role="status" className="mt-4 rounded-xl bg-[#556B2F]/10 p-3 text-sm font-semibold text-[#465826]">{`Se ${done === "1" ? "ajustó 1 producto" : `ajustaron ${done} productos`}.`}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}

      <form method="get" className={panel + " grid gap-3 sm:grid-cols-2"}>
        <label className="grid gap-1 text-sm font-semibold">Buscar<input name="search" defaultValue={search} maxLength={80} placeholder="Nombre, SKU o slug" className={field} /></label>
        <label className="grid gap-1 text-sm font-semibold">Categoría<select name="category" defaultValue={category} className={field}>
          <option value="">Todas</option>{(categories.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Estado<select name="status" defaultValue={status} className={field}>
          <option value="">Cualquiera</option>{PRODUCT_STATUSES.map(s => <option key={s} value={s}>{productStatusLabel(s)}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Porcentaje (ej. 10 o -5)<input name="percent" defaultValue={percentText} required inputMode="decimal" pattern="-?\d{1,3}([.,]\d{1,2})?" className={field} /></label>
        <button type="submit" className="min-h-11 rounded-xl bg-[#556B2F] px-5 font-semibold text-white sm:col-span-2 sm:justify-self-start">Ver vista previa</button>
      </form>
      {percentText && bp === null ? <p role="alert" className="mt-4 text-sm text-amber-900">Ingresá un porcentaje entre -50 y 100, distinto de 0, con hasta dos decimales.</p> : null}
      {readError ? <p role="alert" className="mt-6 text-sm text-amber-900">{readError}</p> : null}

      {plan && bp !== null ? <>
        <section className={panel} aria-labelledby="price-change">
          <h2 id="price-change" className="text-lg font-semibold">Se van a ajustar ({percentText}%): {plan.change.length}</h2>
          {plan.change.length && !plan.tooMany ? <p className="mt-1 text-sm">Redondeo sumando una unidad de cada producto: <strong>{roundingLabel(total)}</strong>.</p> : null}
          {plan.tooMany ? <p role="alert" className="mt-2 text-sm text-amber-900">{`Son más de ${BULK_PRICE_LIMIT}. Acotá la búsqueda o la categoría; no se ajusta una parte sola.`}</p>
            : plan.change.length ? <form action={applyBulkPrice} className="mt-3 grid gap-3">
              <input type="hidden" name="percent" value={percentText} /><input type="hidden" name="returnQuery" value={query} />
              <ul className="grid gap-2">{plan.change.map(({ row, list, special }) => <li key={row.id}><label className="flex items-start gap-3 rounded-xl bg-[#F7F4ED] p-3 text-sm">
                <input type="checkbox" name="productId" value={row.id} defaultChecked className="mt-1 h-5 w-5" />
                <input type="hidden" name={`seen-${row.id}`} value={priceFingerprint(row)} />
                <span className="min-w-0 break-words"><strong>{row.name}</strong> <span className="text-black/60">· {row.sku || "Sin SKU"}</span>
                  <PriceMoveLine label="Lista" move={list} />
                  {special.approved ? <PriceMoveLine label="Especial aprobado" move={special} /> : <AutomaticCashLine fromCents={special.fromCents} toCents={special.toCents} />}
                </span></label></li>)}</ul>
              <p className="text-xs text-black/60">Destildá los que no quieras ajustar.</p>
              <button type="submit" className="min-h-11 justify-self-start rounded-xl bg-[#556B2F] px-5 font-semibold text-white">Confirmar ajuste de precios</button>
            </form> : <p className="mt-2 text-sm text-black/65">Ningún producto de esta búsqueda se puede ajustar.</p>}
        </section>
        {plan.skip.length ? <section className={panel} aria-labelledby="price-skip">
          <h2 id="price-skip" className="text-lg font-semibold">No se ajustan: {plan.skip.length}</h2>
          <ul className="mt-3 grid gap-1 text-sm">{plan.skip.map(({ row, reason }) => <li key={row.id} className="break-words"><strong>{row.name}</strong> <span className="text-black/60">· {reason}</span></li>)}</ul>
        </section> : null}
      </> : null}
    </section>
  </main>;
}
