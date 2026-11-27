import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { InventoryAdjustmentForm } from "@/components/admin/products/inventory-adjustment-form";
import { requireAdminSession } from "@/lib/admin-session";
import { canonicalHistoricalSlug, internalInventoryHref } from "@/lib/admin/internal-inventory";
import { getInternalInventory } from "@/services/internal-inventory";
import { InternalInventoryForm } from "./inventory-form";

export default async function InternalInventoryPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdminSession();
  const { slug } = await params;
  if (!/^historical-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const inventory = await getInternalInventory(slug);
  if (!inventory) notFound();
  const href = internalInventoryHref(inventory.source);
  if (!href) notFound();
  if (canonicalHistoricalSlug(slug) !== slug) redirect(href);
  const { product, source } = inventory;
  const panel = "min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-white p-5";

  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <Link href={`/admin/inventario?search=${encodeURIComponent(source.name)}`} className="underline">Volver al inventario</Link>
      <h1 className="mt-3 break-words text-3xl font-semibold">{source.name}</h1>
      <p className="mt-2 text-sm">Inventario interno · Oculto en la tienda · Bloqueado para ventas nuevas</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className={panel}>
          <h2 className="mb-3 text-xl font-semibold">{product ? "Ajustar stock" : "Cargar stock inicial"}</h2>
          {product ? <InventoryAdjustmentForm productId={product.id} productName={product.name}
            productSlug={product.slug} currentStock={product.stock} /> : <InternalInventoryForm slug={slug} href={href} />}
        </section>
        {product ? <section className={panel}>
          <h2 className="text-xl font-semibold">Registrar venta realizada</h2>
          <p className="mb-3 mt-1 text-sm">Usá esta opción si la unidad vendida ya está contemplada en el saldo físico.</p>
          <InternalInventoryForm slug={slug} href={href} request={randomUUID()} />
        </section> : null}
      </div>
    </section>
  </main>;
}
