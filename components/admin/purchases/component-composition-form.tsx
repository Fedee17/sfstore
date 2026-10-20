"use client";
import { useActionState } from "react";
import { saveComponentComposition } from "@/app/admin/compras/component-actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";

export function ComponentCompositionForm({ purchaseId, recipeId, quantity, cc = 0, lightning = 0 }: { purchaseId: string; recipeId: string; quantity: number; cc?: number; lightning?: number }) {
  const [state, action] = useActionState(saveComponentComposition, { message: "", success: false });
  return <form action={action} className="mt-6 grid gap-4 rounded-2xl border border-[#556B2F]/30 bg-white p-5">
    <h2 className="text-xl font-semibold">Recepción por componentes</h2>
    <p className="text-sm">{quantity} conjuntos = {quantity} cabezales y {quantity} cables. Indicá cuántos cables de cada tipo recibís. El envío se distribuye entre las piezas físicas una sola vez.</p>
    <input type="hidden" name="purchaseId" value={purchaseId}/><input type="hidden" name="recipeId" value={recipeId}/>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">USB-C a USB-C<input className="min-h-11 min-w-0 rounded-xl border p-3" name="cc" type="number" required min="0" max={quantity} step="1" defaultValue={cc}/></label>
      <label className="grid gap-2 text-sm font-semibold">USB-C a Lightning<input className="min-h-11 min-w-0 rounded-xl border p-3" name="lightning" type="number" required min="0" max={quantity} step="1" defaultValue={lightning}/></label>
    </div>
    <PendingSubmitButton pendingLabel="Guardando composición…" className="min-h-11 rounded-full bg-[#556B2F] px-5 py-3 font-semibold text-white disabled:opacity-50">Guardar composición</PendingSubmitButton>
    <p aria-live="polite" role={state.success ? "status" : "alert"} className="text-sm">{state.message}</p>
    <p className="text-xs text-[#1F1F1F]/70">Esta acción no confirma la compra ni modifica stock. Si falta la composición, el servidor impide confirmar.</p>
  </form>;
}
