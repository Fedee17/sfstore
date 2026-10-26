"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { analyticsItem, CONSENT_KEY, getAnalytics, publicRoute, track } from "@/lib/analytics/client";
import { cartItemKey, useCartStore } from "@/store/cart-store";

export function AnalyticsConsent() {
  const pathname = usePathname();
  const search = useSearchParams();
  const analytics = getAnalytics();
  const revision = useSyncExternalStore(analytics.subscribe, analytics.snapshot, () => 0);
  const [preferences, setPreferences] = useState(false);

  useEffect(() => { analytics.initialize(); }, [analytics]);
  useEffect(() => {
    // Raw URL is an in-memory navigation key only; never an event parameter.
    analytics.route(pathname, `${pathname}?${search.toString()}`);
  }, [analytics, pathname, search]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY) analytics.choose(event.newValue === "accepted" ? "accepted" : "rejected");
    };
    window.addEventListener("storage", sync);
    // Observe successful store deltas, not button clicks. No cart contract changes.
    const unsubscribe = useCartStore.subscribe((state, before) => {
      if (!useCartStore.persist.hasHydrated()) return;
      for (const line of state.items) {
        const previous = before.items.find(item => cartItemKey(item) === cartItemKey(line));
        const delta = line.quantity - (previous?.quantity ?? 0);
        const item = analyticsItem({ ...line, quantity: delta });
        if (delta > 0 && item) track("add_to_cart", { items: [item] });
      }
    });
    const contact = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link) return;
      try {
        const url = new URL(link.href);
        if (!["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(url.hostname)) return;
        const route = publicRoute(window.location.pathname);
        const surface = link.closest("header") ? "header" : route === "/carrito" ? "cart" : route?.startsWith("/checkout") ? "checkout" : route === "/producto/[slug]" ? "product" : route === "/ayuda" ? "help" : route === "/" ? "home" : "catalog";
        track("contact_click", { surface }); // Never send href, message or phone.
      } catch { /* Unrecognized link: no event. */ }
    };
    document.addEventListener("click", contact);
    return () => { unsubscribe(); window.removeEventListener("storage", sync); document.removeEventListener("click", contact); };
  }, [analytics]);

  if (revision === 0 || !analytics.enabled() || !publicRoute(pathname)) return null;
  const show = preferences || analytics.consent() === "unknown";
  const choose = (choice: "accepted" | "rejected") => { analytics.choose(choice); setPreferences(false); };
  return <section aria-label="Preferencias de medición" className="border-t border-[#DCE3EA] bg-[#FFFDFA] px-4 py-4 text-[#102033]">
    <div className="mx-auto max-w-6xl">
      {show ? <>
        <h2 className="text-base font-semibold">¿Nos ayudás a mejorar SFSTORE?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6">Con tu permiso, usamos Google Analytics para conocer cómo se navega la tienda. Utiliza cookies e identificadores de navegación; no enviamos tus datos de contacto, mensajes ni información de pago. Podés comprar sin aceptar y cambiar tu elección acá.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={() => choose("accepted")} className="min-h-11 rounded-full border border-[#003B73] bg-white px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Aceptar medición</button>
          <button type="button" onClick={() => choose("rejected")} className="min-h-11 rounded-full border border-[#003B73] bg-white px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Rechazar medición</button>
          {preferences && analytics.consent() !== "unknown" ? <button type="button" className="min-h-11 px-3 text-sm underline" onClick={() => setPreferences(false)}>Cerrar</button> : null}
        </div>
      </> : <button type="button" className="min-h-11 text-sm underline underline-offset-4 focus-visible:outline-2" onClick={() => setPreferences(true)}>Preferencias de medición · {analytics.consent() === "accepted" ? "Aceptada" : "Rechazada"}</button>}
    </div>
  </section>;
}
