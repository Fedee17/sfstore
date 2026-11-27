"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCompletedSale, saveInternalInventory } from "./actions";

const inputStyle = "h-11 w-full min-w-0 rounded-xl border border-[#8B5E3C]/25 bg-white px-3";

export function InternalInventoryForm({ slug, request, href }: { slug: string; request?: string; href: string }) {
  const [quantity, setQuantity] = useState("1");
  const [date, setDate] = useState("");
  const [total, setTotal] = useState("");
  const [stock, setStock] = useState("");
  const action = request ? saveCompletedSale : saveInternalInventory;
  const [result, submit, pending] = useActionState(action.bind(null, slug), {});

  if (result.orderId) {
    return <div className="grid gap-3">
      <p role="status">Venta registrada. El stock conserva su saldo.</p>
      <Link href={`/admin/ventas/${result.orderId}`} className="underline">Ver venta registrada</Link>
      <button type="button" onClick={() => window.location.assign(href)} className="text-left underline">Registrar otra venta realizada</button>
    </div>;
  }

  return <form action={submit} className="grid gap-3">
    {request ? <>
      <input type="hidden" name="request" value={request} />
      <label className="grid gap-1">Fecha de la venta<input className={inputStyle} name="date" type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="grid gap-1">Cantidad<input className={inputStyle} name="quantity" type="number" min="1" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
      <label className="grid gap-1">Importe total en pesos<input className={inputStyle} name="total" inputMode="decimal" required value={total} onChange={event => setTotal(event.target.value)} /></label>
    </> : <label className="grid gap-1">Unidades contadas<input className={inputStyle} name="stock" type="number" min="0" step="1" required value={stock} onChange={event => setStock(event.target.value)} /></label>}
    {result.error ? <p role="alert" className="text-red-800">{result.error}</p> : null}
    <button type="submit" disabled={pending} className="min-h-11 rounded-2xl bg-[#556B2F] px-4 font-semibold text-white disabled:opacity-60">
      {pending ? "Guardando…" : request ? "Guardar venta realizada" : "Guardar stock inicial"}
    </button>
  </form>;
}
