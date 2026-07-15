"use client";

import { useState } from "react";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import { useCartStore } from "@/store/cart-store";
import type { Product } from "@/types/product";

type ProductActionsProps = {
  product: Product;
};

export function ProductActions({ product }: ProductActionsProps) {
  const addItem = useCartStore((state) => state.addItem);
  const currentQuantity = useCartStore(
    (state) =>
      state.items.find((item) => item.productId === product.id)?.quantity ?? 0,
  );
  const [feedback, setFeedback] = useState("");
  const isAvailable = product.stock > 0;
  const isAtMaxStock = isAvailable && currentQuantity >= product.stock;

  function handleAddToCart() {
    if (!isAvailable) {
      return;
    }

    if (isAtMaxStock) {
      setFeedback("Ya agregaste el stock disponible.");
      return;
    }

    addItem(product);
    setFeedback("Producto agregado al carrito.");
  }

  return (
    <div className="mt-8 min-w-0">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {isAvailable ? (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isAtMaxStock}
            className="min-h-12 min-w-0 rounded-full bg-[#0072CE] px-6 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#003B73] disabled:cursor-not-allowed disabled:bg-[#0072CE]/55"
          >
            {isAtMaxStock ? "Stock mÃ¡ximo en carrito" : "Agregar al carrito"}
          </button>
        ) : (
          <a
            href={getProductWhatsAppLink(product)}
            target="_blank"
            rel="noreferrer"
            className="min-h-12 min-w-0 rounded-full border border-[#0072CE]/35 px-6 py-3.5 text-center text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:bg-[#F7F9FC]"
          >
            Consultar disponibilidad
          </a>
        )}
        <a
          href={getProductWhatsAppLink(product)}
          target="_blank"
          rel="noreferrer"
          className="min-h-12 min-w-0 rounded-full border border-[#102033]/15 px-6 py-3.5 text-center text-sm font-semibold text-[#102033] transition hover:border-[#0072CE] hover:text-[#0072CE]"
        >
          Consultar por WhatsApp
        </a>
      </div>
      {feedback ? (
        <p className="mt-3 break-words text-sm font-semibold text-[#0072CE]">
          {feedback}
        </p>
      ) : null}
      <p className="mt-4 break-words text-sm leading-6 text-[#102033]/60">
        Te ayudamos a elegir segÃºn tus gustos, ocasiÃ³n y presupuesto.
      </p>
    </div>
  );
}

