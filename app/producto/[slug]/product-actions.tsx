"use client";

import { useState } from "react";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import { useCartStore, cartItemKey } from "@/store/cart-store";
import type { Product } from "@/types/product";
import { CartConfirmationLabel, cartConfirmationClass, useCartAddConfirmation } from "@/components/add-to-cart-button";
import { ProductDetailCartIcon, ProductDetailContact, productDetailBuyClass } from "@/components/product-detail-layout";
import { initialPaymentOption, PaymentChoiceNotice, ProductPriceOptions, type PaymentOption } from "@/components/product-price-options";
import { getPublishedPaymentPrices, type PaymentPrices } from "@/lib/products/payment-prices";

type ProductActionsProps = {
  product: Product;
  installments: number | null;
  /** Local visual comparison: the mockup amounts and its initial state; nothing is added to the cart. */
  reference?: PaymentPrices;
};

/** Price options and purchase actions of a simple product or combo page. */
export function ProductActions({ product, installments, reference }: ProductActionsProps) {
  const key = product.combo ? `${product.combo.presentationId}:${product.combo.connector}` : product.id;
  const [payment, setPayment] = useState<PaymentOption | null>(() => reference ? null : initialPaymentOption(installments));
  const { addToCart, confirmed, feedback, announcement } = useCartAddConfirmation(product, key);
  const cartItem = useCartStore((state) => state.items.find((item) => cartItemKey(item) === key));
  const currentQuantity = cartItem?.quantity ?? 0;
  // List and cash price must both be valid: checkout charges the cash price.
  const validPrice = getPublishedPaymentPrices(product) !== null;
  const isAvailable = product.stock > 0 && validPrice;
  const reachedCartLimit = cartItem ? cartItem.quantity >= cartItem.stock : false;
  const isAtMaxStock = isAvailable && (reachedCartLimit || currentQuantity >= product.stock);
  // The cart and checkout charge the cash (transfer) price only.
  const cashChosen = payment === "cash";

  return (
    <section aria-label="Precio y compra" className="@container min-w-0 space-y-3">
      <ProductPriceOptions prices={reference ?? getPublishedPaymentPrices(product)} installments={installments} payment={payment} onPaymentChange={setPayment} showCftea={!reference} />
      <div className="grid min-w-0 gap-2">
        {isAvailable ? (
          <button
            type="button"
            onClick={() => { if (cashChosen && !reference) addToCart(); }}
            disabled={!confirmed && (isAtMaxStock || !cashChosen)}
            aria-disabled={confirmed || undefined}
            className={confirmed ? `${productDetailBuyClass} ${cartConfirmationClass}` : `${productDetailBuyClass} disabled:opacity-60 motion-reduce:transition-none`}
          >
            {confirmed ? <CartConfirmationLabel /> : <><ProductDetailCartIcon />{isAtMaxStock ? "Stock máximo en carrito" : "Agregar al carrito"}</>}
          </button>
        ) : (
          <ProductDetailContact href={getProductWhatsAppLink(product)}>
            {validPrice ? "Consultar disponibilidad" : "Consultar precio"}
          </ProductDetailContact>
        )}
        {isAvailable ? <ProductDetailContact href={getProductWhatsAppLink(product)} /> : null}
        {/* Status messages stay inside the actions grid, as in the approved design, so they add no spacing. */}
        {isAvailable ? <PaymentChoiceNotice payment={payment} /> : null}
        <p role="status" aria-atomic="true" className={feedback ? "break-words text-sm font-semibold text-[var(--boutique-olive,#003B73)]" : "sr-only"}>
          {announcement}
        </p>
      </div>
    </section>
  );
}
