"use client";

import { useEffect, useRef, useState } from "react";
import { getPublishedPaymentPrices } from "@/lib/products/payment-prices";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import { useCartStore, cartItemKey, cartAddedEvent } from "@/store/cart-store";
import type { Product } from "@/types/product";

import type { ReactNode } from "react";

const confirmationText = "¡Agregado al carrito!";
export const cartConfirmationClass = "bg-[#087A3B]! text-white! leading-tight! transition-none!";

export function CartConfirmationLabel() {
  return <span><span aria-hidden="true">✓ </span>{confirmationText}</span>;
}

export function useCartAddConfirmation(product: Product, key: string, messagePrefix = "") {
  const addItem = useCartStore((state) => state.addItem);
  const [feedback, setFeedback] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const locked = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  function addToCart() {
    if (locked.current || !getPublishedPaymentPrices(product) || product.stock <= 0 || product.kind === "family") return;
    locked.current = true;
    const quantity = () => useCartStore.getState().items.find((item) => cartItemKey(item) === key)?.quantity ?? 0;

    try {
      const before = quantity();
      addItem(product);
      if (quantity() > before) {
        setFeedback("");
        setConfirmed(true);
        timeout.current = setTimeout(() => {
          locked.current = false;
          setConfirmed(false);
        }, 2000);
        window.dispatchEvent(new Event(cartAddedEvent));
        return;
      }
      setFeedback(`${messagePrefix}Ya agregaste el stock disponible.`);
    } catch {
      setFeedback(`${messagePrefix}No se pudo confirmar el agregado. Revisá tu carrito.`);
    }
    locked.current = false;
  }

  return { addToCart, confirmed, feedback, announcement: confirmed ? `${product.name}: ${confirmationText}` : feedback };
}

export function AddToCartButton({ product, compact = false, primary = false, buttonClassName, icon }: {
  product: Product;
  compact?: boolean;
  primary?: boolean;
  buttonClassName?: string;
  icon?: ReactNode;
}) {
  const key = product.combo ? `${product.combo.presentationId}:${product.combo.connector}` : product.id;
  const item = useCartStore((state) => state.items.find((entry) => cartItemKey(entry) === key));
  const { addToCart, confirmed, feedback, announcement } = useCartAddConfirmation(product, key, compact ? "" : `${product.name}: `);
  const atLimit = Boolean(item && item.quantity >= item.stock);

  if (!getPublishedPaymentPrices(product)) return (
    <a href={getProductWhatsAppLink(product)} target="_blank" rel="noopener noreferrer"
      aria-label={`Consultar precio de ${product.name}`}
      className="flex min-h-12 w-full items-center justify-center rounded-full border border-[#0072CE]/35 px-5 py-3 text-center text-sm font-semibold text-[#003B73] transition hover:bg-[#F7F9FC]">
      Consultar precio
    </a>
  );

  const baseClass = buttonClassName ?? `flex w-full min-w-0 items-center justify-center rounded-full text-center font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003B73] disabled:cursor-not-allowed ${primary
          ? "min-h-11 bg-[#102747] px-2 py-1 text-sm text-white hover:bg-[#003B73] disabled:bg-[#526479]"
          : compact
          ? "min-h-11 border border-[var(--boutique-contact-border,#B9CEE2)] px-2 py-1 text-xs text-[var(--boutique-olive,#003B73)] hover:bg-[var(--boutique-soft,#E8F3FF)] disabled:text-[var(--boutique-muted,#526479)]"
          : "min-h-12 bg-[#0072CE] px-5 py-3 text-sm text-white transition hover:bg-[#003B73] disabled:bg-[#526479]"}`;

  return (
    <div>
      <button type="button" onClick={addToCart} disabled={!confirmed && (product.kind === "family" || atLimit || product.stock <= 0)}
        aria-disabled={confirmed || undefined}
                className={confirmed ? `${baseClass} ${cartConfirmationClass}` : baseClass}>
        {/* Review 21/11 (WCAG 2.5.3): the accessible name starts with the visible text; the product name follows for screen readers. */}
        {confirmed ? <CartConfirmationLabel /> : <>{icon}{atLimit ? <>Stock máximo en carrito<span className="sr-only"> de {product.name}</span></> : <>Agregar al carrito<span className="sr-only"> {product.name}</span></>}</>}
      </button>
      <p role="status" aria-atomic="true" className={feedback ? "mt-2 break-words text-sm font-semibold text-[var(--boutique-olive,#003B73)]" : "sr-only"}>{announcement}</p>
    </div>
  );
}
