"use client";

import { useState } from "react";
import { hasValidWebPrice } from "@/lib/web-transfer-pricing";
import { getProductWhatsAppLink } from "@/lib/whatsapp";
import { useCartStore, cartItemKey } from "@/store/cart-store";
import type { Product } from "@/types/product";

export function AddToCartButton({ product }: { product: Product }) {
  const key = product.combo ? `${product.combo.presentationId}:${product.combo.connector}` : product.id;
  const item = useCartStore((state) => state.items.find((entry) => cartItemKey(entry) === key));
  const addItem = useCartStore((state) => state.addItem);
  const [feedback, setFeedback] = useState("");
  const atLimit = Boolean(item && item.quantity >= item.stock);

  function addToCart() {
    if (!hasValidWebPrice(product.price)) return;
    const before = useCartStore.getState().items.find((entry) => cartItemKey(entry) === key)?.quantity ?? 0;
    addItem(product);
    const after = useCartStore.getState().items.find((entry) => cartItemKey(entry) === key)?.quantity ?? 0;
    setFeedback(after > before ? `${product.name}: agregado al carrito (${after}).` : `${product.name}: ya agregaste el stock disponible.`);
  }

  if (!hasValidWebPrice(product.price)) return (
    <a href={getProductWhatsAppLink(product)} target="_blank" rel="noopener noreferrer"
      aria-label={`Consultar precio de ${product.name}`}
      className="flex min-h-12 w-full items-center justify-center rounded-full border border-[#0072CE]/35 px-5 py-3 text-center text-sm font-semibold text-[#003B73] transition hover:bg-[#F7F9FC]">
      Consultar precio
    </a>
  );

  return (
    <div>
      <button type="button" onClick={addToCart} disabled={product.kind === "family" || atLimit || product.stock <= 0}
        aria-label={`Agregar ${product.name} al carrito`}
        className="flex min-h-12 w-full min-w-0 items-center justify-center rounded-full bg-[#0072CE] px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#003B73] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003B73] disabled:cursor-not-allowed disabled:bg-[#526479]">
        {atLimit ? "Stock máximo en carrito" : "Agregar al carrito"}
      </button>
      <p role="status" aria-atomic="true" className="mt-2 break-words text-sm font-semibold text-[#003B73]">{feedback}</p>
    </div>
  );
}
