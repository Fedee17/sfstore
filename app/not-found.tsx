import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { brand } from "@/lib/brand";

export default function NotFound() {
  return (
    <main className="min-h-screen" style={{ background: brand.colors.background, color: brand.colors.text }}>
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <p className="text-sm font-semibold">Página no encontrada · 404</p>
        <h1 className="catalog-title mt-3">No encontramos esta página</h1>
        <p className="mt-4 max-w-xl">El enlace puede haber cambiado. Podés buscar el producto o volver al inicio.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/buscar" className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-white" style={{ background: brand.colors.deepBlue }}>Buscar productos</Link>
          <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold" style={{ borderColor: brand.colors.border }}>Volver al inicio</Link>
        </div>
      </section>
    </main>
  );
}
