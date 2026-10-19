import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { FamilyForm,OptionForm,ValueForm,VariantForm } from "@/components/admin/products/family-forms";
import { requireAdminSession } from "@/lib/admin-session";
import { getProductFamily,findSimpleFamilyProducts,getSimpleFamilyCandidate } from "@/services/product-families";
import { getAdminCategories } from "@/services/admin";
export default async function FamilyPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string;search?:string;candidate?:string}>}) {
 await requireAdminSession(); const {id}=await params;const q=await searchParams;
 if(!/^[0-9a-f-]{36}$/i.test(id)) notFound();
 const [data,categories]=await Promise.all([getProductFamily(id,Number(q.page??1)),getAdminCategories()]);if(!data)notFound();
 const matches=q.search?await findSimpleFamilyProducts(data.family.category_id,q.search):[];
 const candidate=q.candidate&&/^[a-f0-9-]{36}$/i.test(q.candidate)?await getSimpleFamilyCandidate(q.candidate,data.family.category_id):null;
 return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav/><section className="mx-auto max-w-6xl space-y-6 px-5 py-10">
 <Link href="/admin/productos/familias" className="underline">Todas las familias</Link><h1 className="text-3xl font-semibold">{data.family.name}</h1>
 <div className="grid gap-6 lg:grid-cols-2">{categories.error?<p role="alert">{categories.error}</p>:<FamilyForm family={data.family} id={id} categories={categories.data??[]}/>}
 <div className="space-y-4">{data.total===0?<OptionForm familyId={id}/>:<p>Las combinaciones existentes conservan su identidad. Podés agregar nuevos valores.</p>}{data.options.map(o=><ValueForm key={o.id} familyId={id} option={o}/>)}</div></div>
 <section className="space-y-4 rounded-3xl border border-[#8B5E3C]/20 p-5"><h2 className="text-xl font-semibold">Asociar un producto simple existente</h2>
 <p>Buscá por nombre o SKU en esta categoría. No se modifica su stock ni se distribuyen unidades. Debe tener un SKU asignado.</p>
 <form method="get" className="flex flex-wrap gap-3"><label>Nombre o SKU<input name="search" minLength={2} maxLength={80} defaultValue={q.search} className="ml-3 rounded-xl border p-3" required/></label><button className="rounded-xl border px-5 py-3">Buscar</button></form>
 {matches.slice(0,20).map(p=><Link key={p.id} href={`?candidate=${p.id}`} className="block underline">{p.name} · SKU {p.sku} · Lista ${Number(p.price).toFixed(2)} · Stock {p.stock}</Link>)}
 {matches.length>20?<p>Hay más resultados. Refiná la búsqueda para elegir el producto correcto.</p>:q.search&&!matches.length?<p>Sin coincidencias elegibles.</p>:null}
 {candidate?<VariantForm id={candidate.id} candidate family={data.family} options={data.options} variant={candidate}/>:null}
 </section>
 <h2 className="text-2xl font-semibold">SKU de la familia</h2><div className="grid gap-6 lg:grid-cols-2">{data.variants.map(v=><VariantForm key={v.id} id={v.id} family={data.family} options={data.options} variant={v}/>)}
 {data.options.length?<VariantForm id={randomUUID()} family={data.family} options={data.options}/>:<p>Agregá opciones antes de crear variantes.</p>}</div>
 <nav aria-label="Páginas de SKU" className="flex gap-4">{data.page>1?<Link href={`?page=${data.page-1}`}>Anterior</Link>:null}<span>Página {data.page} · {data.total} SKU</span>{data.page*data.pageSize<data.total?<Link href={`?page=${data.page+1}`}>Siguiente</Link>:null}</nav>
 </section></main>;
}
