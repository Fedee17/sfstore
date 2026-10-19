"use client";
import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/types/product";
import { SiteHeader } from "@/components/site-header";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { getWebTransferPrice } from "@/lib/web-transfer-pricing";
const money=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:2});
export function ProductFamilyDetail({product}:{product:Product}) {
 const variants=product.variants??[],[choices,setChoices]=useState<Record<string,string>>({});
 const dimensions=[...new Set(variants.flatMap(p=>Object.keys(p.variantOptions??{})))].sort();
 const complete=dimensions.length>0&&dimensions.every(d=>!!choices[d]);
 const selected=complete?variants.find(p=>dimensions.every(d=>p.variantOptions?.[d]===choices[d])):undefined;
 const cartProduct=selected?{...selected,slug:product.slug}:null;
 return <main className="min-h-screen bg-[#F7F9FC] text-[#102033]"><SiteHeader/>
 <section className="mx-auto max-w-6xl px-5 py-8"><Link href={product.category==="perfumes"?"/perfumes":"/mates"} className="underline">Volver al catálogo</Link>
 <h1 className="my-6 break-words text-3xl font-semibold">{product.name}</h1>
 <div className="grid min-w-0 gap-7 lg:grid-cols-2"><div className="min-w-0 overflow-hidden rounded-3xl border bg-[#102033]">
 <ProductImageGallery key={selected?.id??product.id} images={selected?.images??[]} placeholder={product.imagePlaceholder} productName={selected?.name??product.name}/>
 </div><div className="min-w-0 space-y-5 rounded-3xl border border-[#003B73]/20 bg-white p-6">
 <p>Elegí todas las opciones para ver el precio, la fotografía y la disponibilidad del SKU.</p>
 {dimensions.map(d=><label key={d} className="grid gap-2 font-semibold">{d}<select aria-label={d} className="min-h-12 min-w-0 rounded-xl border p-3" value={choices[d]??""} onChange={e=>setChoices({...choices,[d]:e.target.value})}><option value="">Seleccioná {d.toLowerCase()}</option>{[...new Set(variants.map(p=>p.variantOptions?.[d]).filter((v):v is string=>!!v))].sort().map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}
 <div aria-live="polite" aria-atomic="true" className="space-y-3">
 {selected?<><h2 className="break-words font-semibold">{selected.name}</h2><p>SKU: {selected.sku}</p>
 <p data-testid="variant-list-price">Precio de lista: {money.format(selected.price)}</p><p data-testid="variant-transfer-price" className="text-2xl font-bold">Transferencia: {money.format(getWebTransferPrice(selected.price))}</p>
 <p>25% de descuento. Pago completo por transferencia.</p><p data-testid="variant-stock">{selected.stock>0?`Disponible: ${selected.stock} unidad${selected.stock===1?"":"es"}`:"Sin stock de esta variante"}</p></>:<p>{complete?"Esta combinación no está disponible.":`Desde ${money.format(getWebTransferPrice(product.price))} por transferencia. Falta seleccionar la variante.`}</p>}
 </div>
 {cartProduct?<AddToCartButton key={cartProduct.id} product={cartProduct}/>:<button type="button" disabled className="w-full rounded-full bg-[#526479] px-5 py-3 text-white">Seleccioná una variante</button>}
 <p className="text-sm">La disponibilidad se verifica nuevamente al preparar el pedido. Agregar al carrito no reserva stock.</p>
 </div></div></section></main>;
}
