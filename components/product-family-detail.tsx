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
    <section className="mx-auto max-w-6xl px-4 py-3 sm:py-8 lg:px-5">
      <Link href={publicCategoryPaths[product.category]} className="text-sm font-semibold text-[#003B73] underline underline-offset-4">← Volver al catálogo</Link>
      <h1 className="my-3 break-words text-2xl font-semibold leading-tight sm:text-4xl lg:my-5">{product.name}</h1>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2 lg:items-start lg:gap-5">
        <div className="order-1 -mx-3 min-w-0 overflow-hidden rounded-2xl border border-[#003B73]/20 lg:mx-0 lg:rounded-3xl">
          <ProductImageGallery key={selected?.id ?? product.id} images={images} placeholder={product.imagePlaceholder} productName={selected?.name ?? product.name} naturalSizeOnMobile />
          {!selected && representative ? <p className="bg-white px-3 py-2 text-xs leading-5 text-[#102033]/75 lg:px-4 lg:py-3">
            Imagen representativa: {representative.label}
          </p> : null}
        </div>
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:gap-4 lg:rounded-3xl lg:border lg:border-[#003B73]/20 lg:bg-white lg:p-6">
          <div aria-live="polite" aria-atomic="true" className="order-2 space-y-1 lg:order-1">
            {selected ? <p className="text-xs font-semibold text-[#003B73]">Precio de la variante elegida</p> : null}
            <p data-testid="variant-transfer-price" className={`break-words font-bold ${selected ? "text-3xl" : "text-2xl lg:text-3xl"}`}>{selected ? "" : "Desde "}{money.format(getWebTransferPrice(price))}</p>
            <p className="text-sm text-[#003B73]">Transferencia · 25% OFF · pago completo</p>
            <p data-testid="variant-list-price" className="text-sm text-[#102033]/70">Precio de lista: {selected ? "" : "desde "}{money.format(price)}</p>
          </div>
          {dimensions.map(d => <fieldset key={d} className="order-1 min-w-0 rounded-2xl border border-[#DCE3EA] bg-[#FFFDFA] px-3 pb-3 pt-1 lg:order-2">
            <legend className="mb-2 break-words px-1 font-semibold text-[#003B73]">{choices[d] ? `${d}: ${choices[d]}` : isColor ? "Elegí un color para continuar" : `Elegí ${d.toLowerCase()}`}</legend>
            <div className="flex flex-wrap gap-2">
              {[...new Set(variants.map(p => p.variantOptions?.[d]).filter((v): v is string => !!v))].sort().map(value => {
                const matching = variants.filter(p => p.variantOptions?.[d] === value && dimensions.every(other => other === d || !choices[other] || p.variantOptions?.[other] === choices[other]));
                const available = matching.some(p => p.stock > 0), chosen = choices[d] === value;
                return <button key={value} type="button" aria-pressed={chosen}
                  onClick={() => setChoices(current => ({ ...current, [d]: value }))}
                  className={`min-h-12 max-w-full break-words rounded-xl border px-3 py-2 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0072CE] lg:min-h-11 ${chosen ? "border-[#0072CE] bg-[#0072CE]/10 font-semibold text-[#003B73] ring-1 ring-[#0072CE] lg:ring-0" : "border-[#003B73]/40 bg-white text-[#102033]"}`}>
                  {chosen ? <span aria-hidden="true" className="mr-1">✓</span> : null}
                  {value}{!available ? matching.length ? " · Agotado" : " · No disponible" : ""}
                </button>;
              })}
            </div>
          </fieldset>)}
          {selected || complete ? <div role="status" aria-live="polite" aria-atomic="true" className="order-3 space-y-1 text-sm">
            {selected ? <>
              <p className="hidden break-words font-semibold lg:block">{dimensions.map(d => `${d}: ${choices[d]}`).join(" · ")}</p>
              <p data-testid="variant-stock">{selected.stock > 0 ? `Disponible: ${selected.stock} unidad${selected.stock === 1 ? "" : "es"}` : "Sin stock de esta variante"}</p>
              <p className="hidden break-all text-xs text-[#102033]/60 lg:block">SKU: {selected.sku}</p>
            </> : <p>Esta combinación no está disponible.</p>}
          </div> : null}
          <div className="order-4">{cartProduct ? <AddToCartButton key={cartProduct.id} product={cartProduct} />
            : <button type="button" disabled className="min-h-12 w-full rounded-full bg-[#DCE3EA] px-5 py-3 text-sm font-semibold text-[#45576A]">Agregar al carrito</button>}
          </div>
          <p className="order-5 text-xs leading-5 text-[#102033]/70">Agregar al carrito no reserva stock; se verifica al preparar el pedido.</p>
        </div>
      </div>
    </section>
  </main>;
}
