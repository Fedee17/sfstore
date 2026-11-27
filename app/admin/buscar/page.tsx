import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { normalizeSearchTerm } from "@/lib/admin/global-search";
import { searchAdmin } from "@/services/global-search";

const panel = "min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm";

export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireAdminSession();
  const raw = (await searchParams).q;
  const typed = typeof raw === "string" ? raw : "";
  const term = normalizeSearchTerm(typed);
  const result = term ? await searchAdmin(term) : null;
  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <h1 className="text-3xl font-semibold">Buscar en el admin</h1>
      <form action="/admin/buscar" method="get" role="search" className="mt-5 flex flex-wrap gap-3">
        <label htmlFor="admin-search-page" className="sr-only">Buscar productos, SKU, ventas, encargos, compras o proveedores</label>
        <input id="admin-search-page" name="q" type="search" defaultValue={typed} minLength={2} maxLength={80} required autoFocus placeholder="Producto, SKU, cliente, número de venta o proveedor" className="h-12 min-w-0 flex-1 rounded-xl border border-[#8B5E3C]/30 bg-white px-4" />
        <button type="submit" className="min-h-12 rounded-xl bg-[#556B2F] px-5 font-semibold text-white">Buscar</button>
      </form>
      <p className="mt-2 text-xs text-black/60">Atajo: Ctrl + K (o «/») desde cualquier pantalla del admin.</p>
      {typed && !term ? <p role="alert" className="mt-6 text-sm text-amber-900">Escribí entre 2 y 80 caracteres.</p> : null}
      {result ? <div className="mt-6 grid gap-5">
        <p className="text-sm text-black/65" role="status">{result.total ? `${result.total} ${result.total === 1 ? "resultado" : "resultados"} para «${result.term}».` : `No encontramos nada para «${result.term}».`}</p>
        {result.groups.map(group => <section key={group.key} className={panel} aria-labelledby={`search-${group.key}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id={`search-${group.key}`} className="text-lg font-semibold">{group.label}</h2>
            {group.error ? null : <Link href={group.allHref} className="text-sm font-semibold text-[#465826] underline">Ver todos en {group.label}</Link>}</div>
          {group.error ? <p role="alert" className="mt-3 text-sm text-amber-900">{group.error}</p> : <ul className="mt-3 grid gap-2">{group.items.map(item => <li key={item.id}>
            <Link href={item.href} className="block rounded-xl bg-[#F7F4ED] p-3 hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-offset-2"><span className="block break-words font-semibold">{item.title}</span><span className="mt-1 block break-words text-xs text-black/65">{item.detail}</span></Link>
          </li>)}</ul>}
          {group.more ? <p className="mt-2 text-xs text-black/60">Y {group.more} más en {group.label}.</p> : null}
        </section>)}
      </div> : null}
    </section>
  </main>;
}
