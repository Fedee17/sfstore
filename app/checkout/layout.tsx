import type { Metadata } from "next";
import type { ReactNode } from "react";

// The checkout pages are client components; their tab titles live in these segment layouts.
// Object form so the nested steps (entrega, exito) keep the brand suffix: a plain string title would drop the root template for them.
export const metadata: Metadata = { title: { default: "Finalizar compra", template: "%s | SFSTORE Importados" } };

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
