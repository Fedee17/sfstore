"use client";
import { useActionState } from "react";
import { registerComponentRecipe } from "@/app/admin/productos/componentes/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
export function ComponentRecipeForm({ products }: { products: { id: string; name: string; sku: string | null; stock: number }[] }) {
  const [state, action] = useActionState(registerComponentRecipe, { message: "" });
  return <form action={action} className="mt-6 grid gap-4 rounded-2xl bg-white p-5">
    <label className="grid gap-2 font-semibold">Nombre comercial<input name="name" maxLength={160} required className="min-h-11 min-w-0 rounded-xl border p-3"/></label>
    <div className="grid gap-4 md:grid-cols-2">{[
      ["source", "Conjunto recibido del proveedor"], ["head", "Cabezal físico existente"], ["cc", "Cable USB-C a USB-C"], ["lightning", "Cable USB-C a Lightning"], ["presentation", "Presentación comercial sin stock"], ["legacy", "Cable histórico sin conector, stock cero"],
    ].map(([key, label]) => <label className="grid gap-2 text-sm font-semibold" key={key}>{label}<select className="min-h-11 min-w-0 max-w-full rounded-xl border p-3" required name={key} defaultValue=""><option value="" disabled>Elegí un SKU existente</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku ?? p.id} · stock {p.stock}</option>)}</select></label>)}</div>
    <p className="text-sm">Registrá primero los dos cables físicos desde Productos como borradores, sin precios nuevos. Esta asociación es fija: revisá los seis SKU antes de confirmar. No convierte la compra. Impide vender directamente el conjunto de origen, la presentación y el cable histórico.</p>
    <PendingSubmitButton pendingLabel="Registrando…" className="min-h-11 rounded-full bg-[#556B2F] px-4 py-3 font-semibold text-white disabled:opacity-50">Registrar composición sin convertir stock</PendingSubmitButton>
    <p role="status" aria-live="polite" className="text-sm">{state.message}</p>
  </form>;
}
