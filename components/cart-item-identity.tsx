"use client";

import type { CartItem } from "@/store/cart-store";
import type { ReactNode } from "react";
import { ProductImage } from "@/components/product-grid";

/** Same SKU identity in the cart and checkout, independent of money and stock. */
export function CartItemIdentity({ item, children }: { item: CartItem; children?: ReactNode }) {
  const name = item.displayName ?? item.name;
  return <div className="flex min-w-0 items-start gap-3">
    <div className="w-16 shrink-0 overflow-hidden rounded-xl border border-[#DCE3EA] sm:w-20">
      <ProductImage compact product={{ name, imagePlaceholder: "", primaryImageUrl: item.primaryImageUrl, primaryImageAlt: item.primaryImageAlt ?? [name, item.variantLabel].filter(Boolean).join(" — ") }} />
    </div>
    <div className="min-w-0">
      <a href={`/producto/${item.slug}`} className="break-words font-semibold leading-snug transition hover:text-[#0072CE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0072CE]">{name}</a>
      {item.variantLabel ? <p className="mt-1 break-words text-sm font-semibold text-[#003B73]">{item.variantLabel}</p> : null}
      {item.sku ? <p className="mt-1 break-all text-xs text-[#526479]">SKU: {item.sku}</p> : null}
      {children}
    </div>
  </div>;
}
