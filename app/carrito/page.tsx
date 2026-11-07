"use client";

import { SiteHeader } from "@/components/site-header";
import CartContent from "@/components/cart-content";

export default function CartPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <CartContent />
      </div>
    </main>
  );
}
