import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { FamilyForm } from "@/components/admin/products/family-forms";
import { requireAdminSession } from "@/lib/admin-session";
import { getProductFamilies } from "@/services/product-families";
import { getAdminCategories } from "@/services/admin";
export default async function FamiliesPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
 await requireAdminSession(); const query=await searchParams;
 const [result,categories]=await Promise.all([getProductFamilies(Number(query.page??1)),getAdminCategories()]);
 return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav/><section className="mx-auto max-w-6xl space-y-6 px-5 py-10">
 <Link href="/admin/productos" className="underline">Volver a productos</Link><h1 className="text-3xl font-semibold">Familias y variantes</h1>
 <p>Una publicación por familia. El inventario, costo e imágenes pertenecen a cada SKU. Los productos simples siguen funcionando.</p>
 <div className="grid gap-6 lg:grid-cols-2"><div className="space-y-4">{result.families.map(f=><Link key={f.id} href={`/admin/productos/familias/${f.id}`} className="block rounded-3xl border border-[#8B5E3C]/20 p-5 font-semibold">{f.name} · Lista ${Number(f.base_price).toFixed(2)}</Link>)}
 {!result.total?<p>No hay familias todavía.</p>:null}<nav aria-label="Páginas de familias" className="flex gap-4">{result.page>1?<Link href={`?page=${result.page-1}`}>Anterior</Link>:null}<span>Página {result.page} · {result.total} familias</span>{result.page*result.pageSize<result.total?<Link href={`?page=${result.page+1}`}>Siguiente</Link>:null}</nav></div>
 {categories.error?<p role="alert">{categories.error}</p>:<FamilyForm id={randomUUID()} categories={categories.data??[]}/>}</div></section></main>;
}
