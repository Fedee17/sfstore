import type { Metadata } from "next";
import Link from "next/link";
import { CatalogFrame, catalogStyles } from "@/components/catalog/catalog-frame";

export const metadata: Metadata = { title: "Página no encontrada" };

// Owner-approved review 21/11: same boutique frame as the rest of the public site (was the legacy blue palette).
export default function NotFound() {
  return (
    <CatalogFrame>
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <p className={`${catalogStyles.emptyText} text-sm font-semibold`}>Página no encontrada · 404</p>
        <h1 className={`${catalogStyles.title} mt-3 text-3xl sm:text-4xl`}>No encontramos esta página</h1>
        <p className={`${catalogStyles.emptyText} mt-4 max-w-xl`}>El enlace puede haber cambiado. Podés buscar el producto o volver al inicio.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/buscar" className={`${catalogStyles.primary} inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold`}>Buscar productos</Link>
          <Link href="/" className={`${catalogStyles.contact} inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold`}>Volver al inicio</Link>
        </div>
      </section>
    </CatalogFrame>
  );
}
