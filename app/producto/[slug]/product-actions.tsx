"use client";

import { useState } from "react";
import { hasValidWebPrice } from "@/lib/web-transfer-pricing";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import { useCartStore, cartItemKey } from "@/store/cart-store";
import type { Product } from "@/types/product";

type ProductActionsProps = {
  product: Product;
};

export function ProductActions({ product }: ProductActionsProps) {
  const key = product.combo ? `${product.combo.presentationId}:${product.combo.connector}` : product.id;
  const addItem = useCartStore((state) => state.addItem);
  const cartItem = useCartStore((state) => state.items.find((item) => cartItemKey(item) === key));
  const currentQuantity = cartItem?.quantity ?? 0;
  const [feedback, setFeedback] = useState("");
  const validPrice = hasValidWebPrice(product.price);
  const isAvailable = product.stock > 0 && validPrice;
  const reachedCartLimit = cartItem ? cartItem.quantity >= cartItem.stock : false;
  const isAtMaxStock = isAvailable && (reachedCartLimit || currentQuantity >= product.stock);

  function handleAddToCart() {
    if (!isAvailable) {
      return;
    }

    if (isAtMaxStock) {
      setFeedback("Ya agregaste el stock disponible.");
      return;
    }

    const before = useCartStore.getState().items.find((item) => cartItemKey(item) === key)?.quantity ?? 0;
    addItem(product);
    const after = useCartStore.getState().items.find((item) => cartItemKey(item) === key)?.quantity ?? 0;
    setFeedback(after > before ? "Producto agregado al carrito." : "Ya agregaste el stock disponible.");
  }

  return (
    <div className="mt-4 min-w-0">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {isAvailable ? (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isAtMaxStock}
            className="min-h-12 min-w-0 rounded-full bg-[#0072CE] px-6 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#003B73] disabled:cursor-not-allowed disabled:bg-[#0072CE]/55"
          >
            {isAtMaxStock ? "Stock máximo en carrito" : "Agregar al carrito"}
          </button>
        ) : (
          <a
            href={getProductWhatsAppLink(product)}
            target="_blank"
            rel="noreferrer"
            className="min-h-12 min-w-0 rounded-full border border-[#0072CE]/35 px-6 py-3.5 text-center text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:bg-[#F7F9FC]"
          >
            {validPrice ? "Consultar disponibilidad" : "Consultar precio"}
          </a>
        )}
        {validPrice ? <a
          href={getProductWhatsAppLink(product)}
          target="_blank"
          rel="noreferrer"
          className="min-h-12 min-w-0 rounded-full border border-[#102033]/15 px-6 py-3.5 text-center text-sm font-semibold text-[#102033] transition hover:border-[#0072CE] hover:text-[#0072CE]"
        >
          Consultar por WhatsApp
        </a> : null}
      </div>
        <p role="status" aria-atomic="true" className="mt-3 break-words text-sm font-semibold text-[#0072CE]">
          {feedback}
        </p>
      <p className="mt-4 break-words text-sm leading-6 text-[#102033]/60">
        {product.kind === "combo" ? "¿Dudas sobre el conector o la compatibilidad con tu equipo? Consultanos antes de comprar." : "Te ayudamos a elegir según tus gustos, ocasión y presupuesto."}
      </p>
    </div>
  );
}

