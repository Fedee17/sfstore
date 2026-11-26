"use client";
import { analyticsItem, track } from "@/lib/analytics/client";

import { useState } from "react";
import type { Product } from "@/types/product";
import { getFamilyRepresentativeImage } from "@/lib/products/family-presentation";
import { ProductSupportSections } from "@/components/product-purchase-summary";
import { initialPaymentOption, PaymentChoiceNotice, ProductPriceOptions, type PaymentOption } from "@/components/product-price-options";
import { getPublishedPaymentPrices } from "@/lib/products/payment-prices";
import { ProductImageGallery } from "@/components/product-image-gallery";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { ProductInformation } from "@/components/product-information";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import { ProductDetailCartIcon, ProductDetailContact, ProductDetailLayout, ProductDetailSummary, productDetailBuyClass } from "@/components/product-detail-layout";

export function ProductFamilyDetail({ product, installments }: { product: Product; installments: number | null }) {
  const variants = product.variants ?? [];
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [payment, setPayment] = useState<PaymentOption | null>(() => initialPaymentOption(installments));
  const dimensions = [...new Set(variants.flatMap(p => Object.keys(p.variantOptions ?? {})))].sort();
  const complete = dimensions.length > 0 && dimensions.every(d => !!choices[d]);
  const selected = complete ? variants.find(p => dimensions.every(d => p.variantOptions?.[d] === choices[d])) : undefined;
  const cartProduct = selected ? { ...selected, slug: product.slug } : null;
  // The cart and checkout charge the cash (transfer) price only; unpriced or sold-out SKUs keep their own states.
  const awaitingCashChoice = !!cartProduct && getPublishedPaymentPrices(cartProduct) !== null && cartProduct.stock > 0 && payment !== "cash";
  const representative = getFamilyRepresentativeImage(product);
  const images = selected ? selected.images ?? [] : representative ? [representative.image] : [];
  const isColor = dimensions.length === 1 && dimensions[0].toLowerCase() === "color";

  return <ProductDetailLayout
    gallery={<>
      <ProductImageGallery key={selected?.id ?? product.id} images={images} placeholder={product.imagePlaceholder} productName={selected?.name ?? product.name} />
      {!selected && representative ? <p className="mt-2 text-center text-xs leading-5 text-[var(--boutique-muted,#45576A)]">
        Imagen representativa: {representative.label}
      </p> : null}
    </>}
    details={<>
      {selected ? <ProductInformation key={selected.id} product={selected} standalone /> : null}
      <ProductSupportSections attributes={selected?.attributes} productName={selected?.name ?? product.name} showShippingContact />
    </>}
  >
    <ProductDetailSummary product={product} selected={selected} />
    <div aria-live="polite" className="@container min-w-0 space-y-1">
      {selected ? <p className="text-xs font-semibold text-[var(--boutique-olive,#003B73)]">Precio de la variante elegida</p> : null}
      <ProductPriceOptions prices={getPublishedPaymentPrices(selected ?? product)} from={!selected} installments={installments} payment={payment} onPaymentChange={setPayment} />
    </div>
    {dimensions.map(d => <fieldset key={d} className="min-w-0 rounded-2xl border border-[var(--boutique-border,#DCE3EA)] bg-[var(--boutique-surface,#fff)] px-3 pb-3 pt-1">
      <legend className="mb-2 break-words px-1 font-semibold text-[var(--boutique-olive,#003B73)]">{choices[d] ? `${d}: ${choices[d]}` : isColor ? "Elegí tu color" : `Elegí ${d.toLowerCase()}`}</legend>
      <div className="flex flex-wrap gap-2">
        {[...new Set(variants.map(p => p.variantOptions?.[d]).filter((v): v is string => !!v))].sort().map(value => {
          const matching = variants.filter(p => p.variantOptions?.[d] === value && dimensions.every(other => other === d || !choices[other] || p.variantOptions?.[other] === choices[other]));
          const available = matching.some(p => p.stock > 0), chosen = choices[d] === value;
          return <button key={value} type="button" aria-pressed={chosen}
            onClick={() => {
              if (choices[d] === value) return;
              const next = { ...choices, [d]: value };
              const variant = variants.find(p => dimensions.every(dimension => p.variantOptions?.[dimension] === next[dimension]));
              const item = variant ? analyticsItem(variant) : null;
              if (item) track("select_item_variant", { items: [item] });
              setChoices(next);
            }}
            className={`min-h-12 max-w-full break-words rounded-xl border px-3 py-2 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--boutique-focus,#0072CE)] lg:min-h-11 ${chosen ? "border-[var(--boutique-focus,#0072CE)] bg-[var(--boutique-focus,#0072CE)]/10 font-semibold text-[var(--boutique-olive,#003B73)] ring-1 ring-[var(--boutique-focus,#0072CE)] lg:ring-0" : "border-[var(--boutique-olive,#003B73)]/40 bg-[var(--boutique-surface,#fff)] text-[var(--boutique-ink,#102033)]"}`}>
            {chosen ? <span aria-hidden="true" className="mr-1">✓</span> : null}
            {value}{!available ? matching.length ? " · Agotado" : " · No disponible" : ""}
          </button>;
        })}
      </div>
    </fieldset>)}
    {selected || complete ? <div role="status" aria-live="polite" aria-atomic="true" className="space-y-1 text-sm">
      {selected ? <>
        <p className="hidden break-words font-semibold lg:block">{dimensions.map(d => `${d}: ${choices[d]}`).join(" · ")}</p>
        <p data-testid="variant-stock">{selected.stock > 0 ? `Disponible: ${selected.stock} unidad${selected.stock === 1 ? "" : "es"}` : "Sin stock de esta variante"}</p>
        <p className="hidden break-all text-xs text-[var(--boutique-ink,#102033)]/60 lg:block">SKU: {selected.sku}</p>
      </> : <p>Esta combinación no está disponible.</p>}
    </div> : null}
    <div className="grid gap-2">
      {cartProduct && !awaitingCashChoice ? <AddToCartButton key={cartProduct.id} product={cartProduct} buttonClassName={productDetailBuyClass} icon={<ProductDetailCartIcon />} />
        : <button type="button" disabled className={`${productDetailBuyClass} disabled:opacity-60`}><ProductDetailCartIcon />Agregar al carrito</button>}
      <ProductDetailContact href={getProductWhatsAppLink(selected ?? product)}>
        {selected?.stock === 0 ? "Consultar disponibilidad por WhatsApp" : "Consultar por WhatsApp"}
      </ProductDetailContact>
    </div>
    {awaitingCashChoice ? <PaymentChoiceNotice payment={payment} /> : null}
    <p className="text-xs leading-5 text-[var(--boutique-ink,#102033)]/70">Agregar al carrito no reserva stock; se verifica al preparar el pedido.</p>
  </ProductDetailLayout>;
}
