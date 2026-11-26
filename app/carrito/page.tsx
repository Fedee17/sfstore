import type { Metadata } from "next";
import { CatalogFrame } from "@/components/catalog/catalog-frame";
import CartContent from "@/components/cart-content";

// Server page so the tab gets its own title; the cart itself stays a client component.
export const metadata: Metadata = { title: "Tu carrito" };

export default function CartPage() {
  return (
    <CatalogFrame>
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <CartContent />
      </div>
    </CatalogFrame>
  );
}
