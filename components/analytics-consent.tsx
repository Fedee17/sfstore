"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { analyticsItem, CONSENT_KEY, getAnalytics, publicRoute, track } from "@/lib/analytics/client";
import { cartItemKey, useCartStore } from "@/store/cart-store";
import styles from "./analytics-consent.module.css";

export function AnalyticsConsent() {
  const pathname = usePathname();
  const search = useSearchParams();
  const analytics = getAnalytics();
  const revision = useSyncExternalStore(analytics.subscribe, analytics.snapshot, () => 0);
  const [preferences, setPreferences] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [details, setDetails] = useState(false);
  const notice = useRef<HTMLElement>(null);
  const manage = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const eligible = revision > 0 && analytics.enabled() && publicRoute(pathname) !== null;
  const show = eligible && (preferences || analytics.consent() === "unknown" && !dismissed);

  useEffect(() => {
    if (!show || !notice.current) return;
    const element = notice.current;
    const resize = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--sfstore-consent-height", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    });
    resize.observe(element);
    if (preferences) element.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => { resize.disconnect(); document.documentElement.style.removeProperty("--sfstore-consent-height"); };
  }, [show, preferences]);

  useEffect(() => {
    if (!show && restoreFocus.current) {
      manage.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [show]);

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

  if (!eligible) return null;
  const close = () => { restoreFocus.current = true; setDismissed(true); setPreferences(false); setDetails(false); };
  const choose = (choice: "accepted" | "rejected") => { analytics.choose(choice); close(); };
  return <section aria-label="Preferencias de medición">
    {!show ? <div className={styles.footer}>
      <span>Medición {analytics.consent() === "accepted" ? "activada" : "desactivada"}</span>
      <button ref={manage} type="button" className={styles.link} aria-expanded={show} aria-controls="sfstore-consent-notice"
        onClick={() => { setDetails(true); setPreferences(true); }}>Gestionar preferencias</button>
    </div> : null}
    {show ? <>
      <div aria-hidden="true" className={styles.spacer} />
      <section ref={notice} id="sfstore-consent-notice" data-analytics-notice aria-labelledby="sfstore-consent-title"
        aria-describedby="sfstore-consent-description" className={styles.notice} onKeyDown={event => { if (event.key === "Escape") close(); }}>
        <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" className={styles.icon}>
          <path d="M39 24a8 8 0 0 1-8-10 7 7 0 0 1-7-8A19 19 0 1 0 43 25a7 7 0 0 1-4-1Z" />
          <circle cx="15" cy="17" r="2" /><circle cx="12" cy="29" r="1.5" /><circle cx="24" cy="25" r="2" /><circle cx="27" cy="37" r="1.5" />
        </svg>
        <div className={styles.copy}>
          <h2 id="sfstore-consent-title">¿Nos ayudás a mejorar SFSTORE?</h2>
          <p id="sfstore-consent-description">Con tu permiso, usamos estadísticas de navegación para mejorar tu experiencia.</p>
        </div>
        <button type="button" className={styles.close} aria-label="Cerrar aviso sin cambiar mi decisión" onClick={close}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
        <div className={styles.actions}>
          <button type="button" className={styles.accept} onClick={() => choose("accepted")}>Aceptar</button>
          <button type="button" className={styles.reject} onClick={() => choose("rejected")}>Rechazar</button>
        </div>
        <button type="button" className={`${styles.link} ${styles.preferences}`} aria-expanded={details} aria-controls="sfstore-consent-details"
          onClick={() => setDetails(!details)}>Gestionar preferencias</button>
        {details ? <div id="sfstore-consent-details" className={styles.details}>
          <p>Google Analytics utiliza cookies e identificadores de navegación. No enviamos tus datos de contacto, mensajes ni información de pago. Podés comprar sin aceptar y cambiar tu elección cuando quieras.</p>
          <p>Medición {analytics.consent() === "accepted" ? "activada" : "desactivada"}. Cerrar este aviso no cambia tu decisión.</p>
        </div> : null}
      </section>
    </> : null}
  </section>;
}
