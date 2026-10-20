import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { ChargerComponentsPreview } from "@/components/admin/purchases/charger-components-preview";
import { requireAdminSession } from "@/lib/admin-session";
import { planChargerComponents, type ChargerComponentPlan } from "@/lib/purchases/charger-components";
import { assertCurrentCommercialOperation } from "@/services/commercial-history-guards";
import { getPurchaseById } from "@/services/purchases";

export default async function ComponentsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ line?: string }>;
}) {
  await requireAdminSession();
  const { id } = await params;
  const { line } = await searchParams;
  let plan: ChargerComponentPlan | undefined;
  let error: string | undefined;
  try {
    if (![id, line].every(value => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) throw new Error("Seleccioná la compra y su línea de cargadores.");
    await assertCurrentCommercialOperation("purchases", id);
    const purchase = await getPurchaseById(id);
    if (!purchase) throw new Error("No se encontró la compra.");
    plan = planChargerComponents(purchase, line!);
  } catch {
    error = "No se pudo conciliar esta compra con el criterio aprobado de 20 conjuntos y 9 vapers. Revisá la línea seleccionada y sus importes; no se modificó nada.";
  }
  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav /><section className="mx-auto max-w-6xl space-y-6 px-5 py-10 sm:px-8">
    <Link className="font-semibold underline" href={`/admin/compras/${id}`}>Volver a la compra</Link>
    <h1 className="break-words text-3xl font-semibold">Conciliar costo de componentes</h1>
    <p className="text-sm">Criterio aprobado: 50% del costo proveedor para cabezal y 50% para cable, independiente del conector. El envío se distribuye entre 49 piezas físicas.</p>
    {error ? <p role="alert" className="rounded-2xl border border-[#8B5E3C]/30 p-4">{error}</p> : plan ? <ChargerComponentsPreview plan={plan} /> : null}
  </section></main>;
}
