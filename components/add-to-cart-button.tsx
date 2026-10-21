"use client";

import { useState } from "react";
import { useCartStore, cartItemKey } from "@/store/cart-store";
import type { Product } from "@/types/product";

export function AddToCartButton({ product }: { product: Product }) {
  const key = product.combo ? `${product.combo.presentationId}:${product.combo.connector}` : product.id;
  const item = useCartStore((state) => state.items.find((entry) => cartItemKey(entry) === key));
  const addItem = useCartStore((state) => state.addItem);
  const [feedback, setFeedback] = useState("");
  const atLimit = Boolean(item && item.quantity >= item.stock);

  function addToCart() {
    const before = useCartStore.getState().items.find((entry) => cartItemKey(entry) === key)?.quantity ?? 0;
    addItem(product);
    const after = useCartStore.getState().items.find((entry) => cartItemKey(entry) === key)?.quantity ?? 0;
    setFeedback(after > before ? `${product.name}: agregado al carrito (${after}).` : `${product.name}: ya agregaste el stock disponible.`);
  }

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
