"use client";
import { useState } from "react";
import type { Product } from "@/types/product";
import { useCartStore } from "@/store/cart-store";
import { getWebTransferPrice } from "@/lib/web-transfer-pricing";

export type ComponentOffer = { id: string; name: string; connector: string; head: Product; cable: Product; presentationId?: string; listPrice?: number; transferPrice?: number; priceVersion?: string };
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
export function ComponentBuyTogether({ offers }: { offers: ComponentOffer[] }) {
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const add = useCartStore(s => s.addCombo);
  const offer = offers.find(o => `${o.id}:${o.connector}` === selected);
  const priced = offer?.listPrice !== undefined && offer.transferPrice === getWebTransferPrice(offer.listPrice) && offer.presentationId && offer.priceVersion;
  const available = offer && priced ? Math.min(offer.head.stock, offer.cable.stock) : 0;
  if (!offers.length) return null;
  return <section className="mt-6 grid gap-3 rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] p-5">
    <h2 className="text-xl font-semibold">Armá tu cargador completo</h2>
    <p className="text-sm">Un cabezal y un cable con precio especial por conjunto. Comparten stock con los artículos individuales. El 25% por efectivo o transferencia se aplica una sola vez.</p>
    <label className="grid gap-2 text-sm font-semibold">Elegí el tipo de cable<select className="min-h-12 min-w-0 max-w-full rounded-xl border p-3" value={selected} onChange={e => { setSelected(e.target.value); setMessage(""); }}>
      <option value="">Seleccioná una opción</option>{offers.map(o => <option key={`${o.id}:${o.connector}`} value={`${o.id}:${o.connector}`}>{o.connector === "cc" ? "USB-C a USB-C" : "USB-C a Lightning"}</option>)}
    </select></label>
    {offer ? <div className="grid gap-2 text-sm"><p>{offer.head.name} + {offer.cable.name}</p>{priced ? <><p>Lista del conjunto: {money.format(offer.listPrice!)}</p><p className="text-lg font-semibold">Efectivo/transferencia: {money.format(getWebTransferPrice(offer.listPrice!))}</p></> : <p>Precio del conjunto no disponible.</p>}<p>{available > 0 ? `${available} conjuntos disponibles` : "Sin stock o precio aprobado para este conjunto"}</p></div> : null}
    <button type="button" disabled={!offer || available < 1} className="min-h-12 rounded-full bg-[#003B73] px-4 py-3 font-semibold text-white disabled:opacity-50" onClick={() => { if (offer && priced) setMessage(add(offer.presentationId!, offer.name, offer.connector as "cc" | "lightning", offer.listPrice!, offer.priceVersion!, offer.head, offer.cable) ? "Agregamos el conjunto con el cable elegido y su precio especial al carrito." : "No alcanza el stock para agregar ambos. Revisá las cantidades del carrito."); }}>Agregar conjunto</button>
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </section>;
}
