import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { AutomaticCashLine, PriceMoveLine, roundingLabel } from "@/components/admin/price-move";
import { requireAdminSession } from "@/lib/admin-session";
import { parsePercent } from "@/lib/admin/bulk-price";
import { BULK_FAMILY_LIMIT, familyFingerprint, planBulkFamilyPrice, type FamilyPricePlan } from "@/lib/admin/bulk-family-price";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getAdminCategories } from "@/services/admin";
import { readFamilyPriceRows } from "@/services/bulk-family-price";
import { applyBulkFamilyPrice } from "./actions";

type Params = Record<string, string | string[] | undefined>;
const one = (params: Params, key: string) => { const value = params[key]; return typeof value === "string" ? value.trim() : ""; };
const panel = "mt-6 min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm";
const field = "h-11 min-w-0 rounded-xl border border-[#8B5E3C]/30 bg-white px-3";
const ERRORS: Record<string, string> = {
  invalid: "La selección o el porcentaje no son válidos. No se cambió ningún precio.",
  read: "No pudimos leer las familias. No se cambió ningún precio.",
  changed: "Alguna familia o variante cambió desde la vista previa. No se cambió ningún precio: revisá la lista de nuevo.",
  write: "No se pudo guardar el ajuste. No se cambió ningún precio.",
};

export default async function BulkFamilyPricePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminSession();
  const params = await searchParams;
  const search = one(params, "search").slice(0, 80), category = one(params, "category");
  const percentText = one(params, "percent"), bp = parsePercent(percentText);
  const categories = await getAdminCategories();
  const query = new URLSearchParams({ search, category, percent: percentText }).toString();

  let plan: FamilyPricePlan | null = null, readError: string | null = null;
  if (bp !== null) {
    try { plan = planBulkFamilyPrice(await readFamilyPriceRows(getSupabaseAdminClient(), { search, category }), bp); }
    catch (cause) { readError = cause instanceof Error && cause.message === "BULK_FAMILY_TOO_BROAD" ? "Son demasiadas familias. Acotá la búsqueda o la categoría." : "No pudimos leer las familias."; }
  }
  const done = one(params, "done"), error = ERRORS[one(params, "error")];

  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/admin/productos/familias" className="text-sm font-semibold text-[#465826] underline">Volver a Familias</Link>
      <h1 className="mt-3 text-3xl font-semibold">Ajustar precios de familias</h1>
      <p className="mt-2 text-sm text-black/65">Sube o baja el precio base de cada familia, el precio propio de sus variantes y su precio especial aprobado con el mismo porcentaje, redondeados al $100 más cercano. Las variantes que heredan el precio base lo siguen. Primero ves el resultado; nada cambia hasta que confirmes. Los productos sueltos se ajustan en <Link href="/admin/productos/precios" className="font-semibold text-[#465826] underline">Ajustar precios</Link>.</p>
      {done && Number.isInteger(Number(done)) ? <p role="status" className="mt-4 rounded-xl bg-[#556B2F]/10 p-3 text-sm font-semibold text-[#465826]">{`Se ${done === "1" ? "ajustó 1 familia" : `ajustaron ${done} familias`}.`}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}

      <form method="get" className={panel + " grid gap-3 sm:grid-cols-3"}>
        <label className="grid gap-1 text-sm font-semibold">Buscar familia<input name="search" defaultValue={search} maxLength={80} placeholder="Nombre de la familia" className={field} /></label>
        <label className="grid gap-1 text-sm font-semibold">Categoría<select name="category" defaultValue={category} className={field}>
          <option value="">Todas</option>{(categories.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Porcentaje (ej. 10 o -5)<input name="percent" defaultValue={percentText} required inputMode="decimal" pattern="-?\d{1,3}([.,]\d{1,2})?" className={field} /></label>
        <button type="submit" className="min-h-11 rounded-xl bg-[#556B2F] px-5 font-semibold text-white sm:col-span-3 sm:justify-self-start">Ver vista previa</button>
      </form>
      {percentText && bp === null ? <p role="alert" className="mt-4 text-sm text-amber-900">Ingresá un porcentaje entre -50 y 100, distinto de 0, con hasta dos decimales.</p> : null}
      {readError ? <p role="alert" className="mt-6 text-sm text-amber-900">{readError}</p> : null}

      {plan && bp !== null ? <>
        <section className={panel} aria-labelledby="family-change">
          <h2 id="family-change" className="text-lg font-semibold">Se van a ajustar ({percentText}%): {plan.change.length} {plan.change.length === 1 ? "familia" : "familias"}</h2>
          {plan.change.length && !plan.tooMany ? <p className="mt-1 text-sm">Redondeo sumando el precio base y una unidad de cada precio propio: <strong>{roundingLabel(plan.roundingCents)}</strong>.</p> : null}
          {plan.tooMany ? <p role="alert" className="mt-2 text-sm text-amber-900">{`Son más de ${BULK_FAMILY_LIMIT} familias. Acotá la búsqueda o la categoría; no se ajusta una parte sola.`}</p>
            : plan.change.length ? <form action={applyBulkFamilyPrice} className="mt-3 grid gap-3">
              <input type="hidden" name="percent" value={percentText} /><input type="hidden" name="returnQuery" value={query} />
              <ul className="grid gap-2">{plan.change.map(({ family, base, variants }) => <li key={family.id}><label className="flex items-start gap-3 rounded-xl bg-[#F7F4ED] p-3 text-sm">
                <input type="checkbox" name="familyId" value={family.id} defaultChecked className="mt-1 h-5 w-5" />
                <input type="hidden" name={`seen-${family.id}`} value={familyFingerprint(family)} />
                <span className="min-w-0 break-words"><strong>{family.name}</strong>
                  <PriceMoveLine label="Precio base" move={base} />
                  <span className="block text-black/60">{`${variants.filter(v => v.inherits).length} ${variants.filter(v => v.inherits).length === 1 ? "variante hereda" : "variantes heredan"} el precio base.`}</span>
                  {variants.filter(v => !v.inherits || v.special.approved).map(({ variant, inherits, list, special }) => <span key={variant.id} className="mt-1 block border-l-2 border-[#8B5E3C]/20 pl-2">
                    <span className="font-semibold">{variant.sku || variant.name}</span>
                    {inherits ? null : <PriceMoveLine label="Precio propio" move={list} />}
                    {special.approved ? <PriceMoveLine label="Especial aprobado" move={special} /> : <AutomaticCashLine fromCents={special.fromCents} toCents={special.toCents} />}
                  </span>)}
                </span></label></li>)}</ul>
              <p className="text-xs text-black/60">Destildá las familias que no quieras ajustar.</p>
              <button type="submit" className="min-h-11 justify-self-start rounded-xl bg-[#556B2F] px-5 font-semibold text-white">Confirmar ajuste de precios</button>
            </form> : <p className="mt-2 text-sm text-black/65">Ninguna familia de esta búsqueda se puede ajustar.</p>}
        </section>
        {plan.skip.length ? <section className={panel} aria-labelledby="family-skip">
          <h2 id="family-skip" className="text-lg font-semibold">No se ajustan: {plan.skip.length}</h2>
          <ul className="mt-3 grid gap-1 text-sm">{plan.skip.map(({ family, reason }) => <li key={family.id} className="break-words"><strong>{family.name}</strong> <span className="text-black/60">· {reason}</span></li>)}</ul>
        </section> : null}
      </> : null}
    </section>
  </main>;
}
