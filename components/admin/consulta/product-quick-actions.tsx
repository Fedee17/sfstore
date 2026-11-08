"use client";

import Link from "next/link";
import {useState} from "react";

const money=(value:number)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2}).format(value);
export function ProductQuickActions({id,name,price,special,available}:{id:string;name:string;price:number;special:number|null;available:boolean}) {
  const [message,setMessage]=useState("");
  const valid=Number.isFinite(price)&&price>0&&special!==null&&Number.isFinite(special)&&special>0;
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${name}\nEfectivo / transferencia: ${money(special!)}\nOtros medios: ${money(price)}${available?"":"\nSin stock disponible"}`);
      setMessage("Precio copiado.");
    } catch {setMessage("No se pudo copiar. Podés seleccionar el precio que aparece en la ficha.");}
  }
  return <div className="mt-4 flex flex-wrap gap-2">
    {valid&&available&&<Link href={`/admin/ventas/nueva?product=${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center rounded-md bg-[#556B2F] px-4 font-semibold text-white hover:bg-[#465826]">Vender este producto</Link>}
    <button type="button" disabled={!valid} onClick={copy} className="min-h-11 rounded-md border border-[#556B2F]/30 px-4 font-semibold text-[#465826] disabled:opacity-50">Copiar precio</button>
    {message&&<p role="status" className="w-full text-xs text-black/65">{message}</p>}
  </div>;
}
