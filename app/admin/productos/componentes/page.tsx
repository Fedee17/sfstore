import Link from "next/link";
import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { listComponentRecipes } from "@/services/component-inventory";
import { ComponentRecipeForm } from "@/components/admin/component-recipe-form";
import { AdminNav } from "@/components/admin/admin-nav";
export default async function ComponentsPage() {
  await requireAdminSession();
  const recipes = await listComponentRecipes();
  const { data, error } = await getSupabaseAdminClient().from("products").select("id,name,sku,stock").eq("historical_identity", false).order("id").limit(501);
  if (error || (data?.length ?? 0) > 500) throw new Error("No se pudo cargar el selector completo. Se requiere una búsqueda paginada si hay más de 500 SKU.");
  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav/><section className="mx-auto max-w-5xl px-5 py-8">
    <Link href="/admin/productos" className="font-semibold underline">Volver a productos</Link>
    <h1 className="mt-4 text-3xl font-semibold">Cargadores por componentes</h1>
    <p className="mt-3">El conjunto no tiene inventario independiente: cada venta utiliza un cabezal y el cable elegido. La conversión de compras confirmadas requiere su procedimiento revisado, no se ejecuta desde esta pantalla.</p>
    {recipes.map(r => <p className="mt-4 rounded-xl border p-4" key={r.id}>{r.name} · {r.prices_approved && r.combo_price_version ? `Conjunto configurado: lista $${r.combo_list_price?.toLocaleString("es-AR", { minimumFractionDigits: 2 })} · efectivo/transferencia $${r.combo_transfer_price?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "Falta configurar o habilitar los precios del conjunto"}</p>)}
    <ComponentRecipeForm products={data ?? []}/>
  </section></main>;
}
