// Optional navigation telemetry. Never used to authorize or calculate a sale.
export type Consent = "unknown" | "accepted" | "rejected";
export const CONSENT_KEY = "sfstore-analytics-consent-v1";
type Params = Record<string, unknown>;
type Command = (...args: unknown[]) => void;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const categories = new Set(["perfumes", "mates", "accesorios"]);
const events = new Set(["view_item_list", "view_item", "select_item_variant", "add_to_cart", "begin_checkout", "catalog_search", "contact_click", "order_pending_transfer"]);

export function publicRoute(path: string): string | null {
  const clean = path.split(/[?#]/, 1)[0];
  if (["/", "/perfumes", "/mates", "/accesorios", "/buscar", "/ayuda", "/carrito", "/checkout", "/checkout/exito", "/checkout/cancelado"].includes(clean)) return clean;
  return /^\/producto\/[^/]+$/.test(clean) ? "/producto/[slug]" : null;
}

export function analyticsItem(input: { id?: string; productId?: string; category?: string; price?: number; quantity?: number; familyId?: string; comboConnector?: string; combo?: { connector: string; presentationId: string } }) {
  const rawId = input.combo?.presentationId ?? input.productId ?? input.id;
  const connector = input.combo?.connector ?? input.comboConnector;
  const id = rawId?.replace(/:(cc|lightning)$/, "");
  if (!id || !uuid.test(id) || !categories.has(input.category ?? "")) return null;
  if (input.quantity !== undefined && (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)) return null;
  return {
    item_id: id,
    item_category: input.category,
    ...(connector === "cc" || connector === "lightning" ? { item_variant: connector } : {}),
    ...(input.familyId && uuid.test(input.familyId) ? { family_id: input.familyId } : {}),
    ...(typeof input.price === "number" && Number.isFinite(input.price) && input.price >= 0 ? { price: Math.round(input.price * 100) / 100 } : {}),
    quantity: Number.isSafeInteger(input.quantity) && input.quantity! > 0 ? input.quantity : 1,
  };
}

// Reconstruct every payload; never spread a caller's customer/order/search object.
export function safeEvent(name: string, input: Params): Params | null {
  if (!events.has(name)) return null;
  const result: Params = {};
  if (Array.isArray(input.items)) {
    result.items = input.items.flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const row = value as Params;
      if (typeof row.item_id !== "string" || !uuid.test(row.item_id) || !categories.has(String(row.item_category))) return [];
      if (row.quantity !== undefined && (!Number.isSafeInteger(row.quantity) || Number(row.quantity) <= 0)) return [];
      return [{ item_id: row.item_id, item_category: row.item_category,
        ...(row.item_variant === "cc" || row.item_variant === "lightning" ? { item_variant: row.item_variant } : {}),
        ...(typeof row.family_id === "string" && uuid.test(row.family_id) ? { family_id: row.family_id } : {}),
        ...(typeof row.price === "number" && Number.isFinite(row.price) && row.price >= 0 ? { price: Math.round(row.price * 100) / 100 } : {}),
        quantity: Number.isSafeInteger(row.quantity) && Number(row.quantity) > 0 ? row.quantity : 1 }];
    });
    result.currency = "ARS";
    result.price_basis = "list";
  }
  if (categories.has(String(input.category))) result.category = input.category;
  if (Number.isSafeInteger(input.result_count) && Number(input.result_count) >= 0) result.result_count = input.result_count;
  if (["home", "catalog", "product", "cart", "checkout", "help", "header", "floating"].includes(String(input.surface))) result.surface = input.surface;
  if (name === "order_pending_transfer") {
    result.payment_state = "pending";
    if (typeof input.value === "number" && Number.isFinite(input.value) && input.value >= 0) { result.value = Math.round(input.value * 100) / 100; result.currency = "ARS"; }
  }
  if (["view_item", "select_item_variant", "add_to_cart", "begin_checkout"].includes(name) && !(result.items as unknown[] | undefined)?.length) return null;
  return result;
}

export type AnalyticsAdapter = {
  enabled: boolean; origin: string;
  load: () => Command; stop: (withdraw?: boolean) => void;
  readConsent: () => string | null; saveConsent: (consent: Consent) => void;
};

export function createAnalytics(adapter: AnalyticsAdapter) {
  let consent: Consent = "unknown", command: Command | undefined, route: string | null = null, identity = "", lastPath = "", revision = 0;
  const seen = new Set<string>(), listeners = new Set<() => void>();
  const notify = () => { revision++; listeners.forEach(listener => listener()); };
  const active = () => adapter.enabled && consent === "accepted" && route !== null;
  function emit(name: string, params: Params, key?: string) {
    if (!active()) return false;
    const safe = name === "page_view" ? {} : safeEvent(name, params);
    if (!safe || key && seen.has(key)) return false;
    try {
      command ??= adapter.load();
      command("set", { page_location: `${adapter.origin}${route}`, page_referrer: "", page_title: "SFSTORE" });
      command("event", name, { ...safe, page_location: `${adapter.origin}${route}`, page_referrer: "", page_title: "SFSTORE", send_to: "sfstore" });
      if (key) seen.add(key);
      return true;
    } catch { return false; } // Analytics must never interrupt shopping.
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => revision,
    consent: () => consent,
    enabled: () => adapter.enabled,
    active,
    initialize() {
      try { const saved = adapter.readConsent(); if (saved === "accepted" || saved === "rejected") consent = saved; } catch { /* no durable consent: ask again */ }
      notify();
    },
    route(path: string, navigationIdentity: string) {
      const next = publicRoute(path);
      if (identity === navigationIdentity && route === next) return;
      const pageAlreadySeen = path === lastPath && seen.has("page");
      identity = navigationIdentity; lastPath = path; route = next; seen.clear();
      if (pageAlreadySeen) seen.add("page"); // Applying a filter is not another page visit.
      // Disable the loaded Google tag on private/unknown routes as well.
      if (!active()) { adapter.stop(); command = undefined; }
      emit("page_view", {}, "page"); notify();
    },
    choose(next: "accepted" | "rejected") {
      consent = next;
      try { adapter.saveConsent(next); } catch { /* choice still applies to this page */ }
      if (next === "rejected") { adapter.stop(true); command = undefined; seen.clear(); }
      emit("page_view", {}, "page"); notify();
    },
    emit,
  };
}

declare global { interface Window { dataLayer?: unknown[]; } }
const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "";
const siteOrigin = process.env.NEXT_PUBLIC_GA4_SITE_ORIGIN ?? "";
let singleton: ReturnType<typeof createAnalytics> | undefined;

function clearAnalyticsCookies() {
  const domains = window.location.hostname.split(".");
  for (const name of document.cookie.split(";").map(cookie => cookie.trim().split("=")[0]).filter(name => /^_ga(?:_|$)|^_gid$|^_gat/.test(name))) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (let i = 0; i < domains.length - 1; i++) document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domains.slice(i).join(".")}`;
  }
}

export function getAnalytics() {
  if (singleton) return singleton;
  const browser = typeof window !== "undefined";
  const enabled = browser && /^G-[A-Z0-9]{4,20}$/.test(measurementId) && siteOrigin === window.location.origin;
  const flag = `ga-disable-${measurementId}`;
  const setDisabled = (value: boolean) => { (window as unknown as Record<string, unknown>)[flag] = value; };
  singleton = createAnalytics({ enabled, origin: siteOrigin,
    readConsent: () => localStorage.getItem(CONSENT_KEY),
    saveConsent: value => localStorage.setItem(CONSENT_KEY, value),
    stop: (withdraw) => {
      if (!browser || !enabled) return;
      setDisabled(true); document.getElementById("sfstore-ga4")?.remove();
      window.dataLayer = [];
      if (withdraw) clearAnalyticsCookies();
      try {
        if (!withdraw) return;
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key?.startsWith("sfstore-analytics-order-")) sessionStorage.removeItem(key);
        }
      } catch { /* Shopping storage is never cleared. */ }
    },
    load: () => {
      setDisabled(false);
      // Google's gtag bootstrap expects Arguments objects in its queue.
      // eslint-disable-next-line prefer-rest-params -- Preserve the official gtag queue contract.
      const command: Command = function () { window.dataLayer ??= []; window.dataLayer.push(arguments); };
      window.dataLayer = [];
      command("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      command("js", new Date());
      command("config", measurementId, { groups: "sfstore", send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
        page_location: `${siteOrigin}${publicRoute(window.location.pathname)}`, page_referrer: "", page_title: "SFSTORE", ignore_referrer: true });
      if (!document.getElementById("sfstore-ga4")) {
        const script = document.createElement("script");
        script.id = "sfstore-ga4"; script.async = true; script.referrerPolicy = "no-referrer";
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
        document.head.appendChild(script);
      }
      return command;
    },
  });
  return singleton;
}

export function track(name: string, params: Params, key?: string) {
  if (typeof window === "undefined") return false;
  return getAnalytics().emit(name, params, key);
}

// A digest stays in consented session storage; operational IDs never go to GA4.
export async function trackCreatedOrder(id: string, total: number) {
  if (!getAnalytics().active() || !uuid.test(id)) return;
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
    const digest = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
    const key = `sfstore-analytics-order-${digest}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    track("order_pending_transfer", { value: total }, key);
  } catch { /* No storage/crypto: omit instead of risk counting a retry twice. */ }
}
