"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/types/product";
import { publicCategoryPaths } from "@/lib/catalog/public-product-visibility";
import { getFamilyRepresentativeImage } from "@/lib/products/family-presentation";
import { getWebTransferPrice } from "@/lib/web-transfer-pricing";
import { SiteHeader } from "@/components/site-header";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { AddToCartButton } from "@/components/add-to-cart-button";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

export function ProductFamilyDetail({ product }: { product: Product }) {
  const variants = product.variants ?? [];
  const [choices, setChoices] = useState<Record<string, string>>({});
  const dimensions = [...new Set(variants.flatMap(p => Object.keys(p.variantOptions ?? {})))].sort();
  const complete = dimensions.length > 0 && dimensions.every(d => !!choices[d]);
  const selected = complete ? variants.find(p => dimensions.every(d => p.variantOptions?.[d] === choices[d])) : undefined;
  const cartProduct = selected ? { ...selected, slug: product.slug } : null;
  const representative = getFamilyRepresentativeImage(product);
  const images = selected ? selected.images ?? [] : representative ? [representative.image] : [];
  const isColor = dimensions.length === 1 && dimensions[0].toLowerCase() === "color";
  const price = selected?.price ?? product.price;

  return <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
    <SiteHeader />
    <section className="mx-auto max-w-6xl px-5 py-5 sm:py-8">
      <Link href={publicCategoryPaths[product.category]} className="text-sm font-semibold text-[#003B73] underline underline-offset-4">← Volver al catálogo</Link>
      <h1 className="my-5 break-words text-2xl font-semibold leading-tight sm:text-4xl">{product.name}</h1>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="order-1 min-w-0 overflow-hidden rounded-3xl border border-[#003B73]/20">
          <ProductImageGallery key={selected?.id ?? product.id} images={images} placeholder={product.imagePlaceholder} productName={selected?.name ?? product.name} />
          <p className="bg-white px-4 py-3 text-xs leading-5 text-[#102033]/75">
            {selected ? "La galería muestra fotografías de la variante elegida. Recorrerlas no cambia tu selección."
              : representative ? `Imagen representativa: ${representative.label}. Elegí tu variante para comprar.`
                : "Elegí una variante para ver su fotografía. Todavía no seleccionaste ninguna."}
          </p>
        </div>
        <div className="order-2 flex min-w-0 flex-col gap-4 rounded-3xl border border-[#003B73]/20 bg-white p-4 sm:p-6">
          <div aria-live="polite" aria-atomic="true" className="order-2 space-y-1 lg:order-1">
            <p data-testid="variant-transfer-price" className="break-words text-3xl font-bold">{selected ? "" : "Desde "}{money.format(getWebTransferPrice(price))}</p>
            <p className="text-sm text-[#003B73]">Por transferencia · 25% de descuento</p>
            <p data-testid="variant-list-price" className="text-sm text-[#102033]/70">Precio de lista: {selected ? "" : "desde "}{money.format(price)}</p>
            <p className="text-xs text-[#102033]/70">Pago completo por transferencia.</p>
          </div>
          {dimensions.map(d => <fieldset key={d} className="order-1 min-w-0 lg:order-2">
            <legend className="mb-2 break-words font-semibold">{choices[d] ? `${d}: ${choices[d]}` : isColor ? "Elegí tu color" : `Elegí ${d.toLowerCase()}`}</legend>
            <div className="flex flex-wrap gap-2">
              {[...new Set(variants.map(p => p.variantOptions?.[d]).filter((v): v is string => !!v))].sort().map(value => {
                const matching = variants.filter(p => p.variantOptions?.[d] === value && dimensions.every(other => other === d || !choices[other] || p.variantOptions?.[other] === choices[other]));
                const available = matching.some(p => p.stock > 0), chosen = choices[d] === value;
                return <button key={value} type="button" aria-pressed={chosen}
                  onClick={() => setChoices(current => ({ ...current, [d]: value }))}
                  className={`min-h-11 max-w-full break-words rounded-xl border px-3 py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0072CE] ${chosen ? "border-[#0072CE] bg-[#0072CE]/10 font-semibold text-[#003B73]" : "border-[#003B73]/40 bg-white text-[#102033]"}`}>
                  {value}{!available ? matching.length ? " · Agotado" : " · No disponible" : ""}
                </button>;
              })}
            </div>
          </fieldset>)}
          <div role="status" aria-live="polite" aria-atomic="true" className="order-3 space-y-1 text-sm">
            {selected ? <>
              <p className="break-words font-semibold">{dimensions.map(d => `${d}: ${choices[d]}`).join(" · ")}</p>
              <p data-testid="variant-stock">{selected.stock > 0 ? `Disponible: ${selected.stock} unidad${selected.stock === 1 ? "" : "es"}` : "Sin stock de esta variante"}</p>
              <p className="break-all text-xs text-[#102033]/60">SKU: {selected.sku}</p>
            </> : <p>{complete ? "Esta combinación no está disponible." : isColor ? "Todavía no elegiste un color." : "Todavía no elegiste todas las opciones."}</p>}
          </div>
          <div className="order-4">{cartProduct ? <AddToCartButton key={cartProduct.id} product={cartProduct} />
            : <button type="button" disabled className="min-h-12 w-full rounded-full bg-[#526479] px-5 py-3 text-sm font-semibold text-white">{isColor ? "Elegí un color para agregar" : "Elegí una variante para agregar"}</button>}
          </div>
          <p className="order-5 text-xs leading-5 text-[#102033]/70">La disponibilidad se verifica nuevamente al preparar el pedido. Agregar al carrito no reserva stock.</p>
        </div>
      </div>
    </section>
  </main>;
}
