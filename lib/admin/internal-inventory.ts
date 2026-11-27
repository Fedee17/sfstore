const HISTORICAL_PREFIX = "historical-";
const INTERNAL_PREFIX = "inventario-interno-";

export function canonicalHistoricalSlug(slug: string) {
  return slug === "historical-ignite-v151" ? "historical-ignite-v150" : slug;
}

export function internalInventorySlug(historicalSlug: string) {
  const slug = canonicalHistoricalSlug(historicalSlug);
  if (!/^historical-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("La ficha histórica no es válida.");
  }
  return INTERNAL_PREFIX + slug.slice(HISTORICAL_PREFIX.length);
}

export function isInternalInventory(product: {
  slug?: string;
  status: string;
  historical_identity?: boolean | null;
  web_visible?: boolean;
  commercial_blocked?: boolean;
}) {
  return product.slug?.startsWith(INTERNAL_PREFIX) === true &&
    product.status === "draft" && product.historical_identity === false &&
    product.web_visible === false && product.commercial_blocked === true;
}

export function internalInventoryHref(product: Parameters<typeof isInternalInventory>[0]) {
  const slug = product.slug;
  if (!slug) return null;
  const historicalSlug = isInternalInventory(product)
    ? HISTORICAL_PREFIX + slug.slice(INTERNAL_PREFIX.length)
    : product.historical_identity === true && slug.startsWith(HISTORICAL_PREFIX)
      ? canonicalHistoricalSlug(slug)
      : null;
  return historicalSlug ? `/admin/inventario/interno/${encodeURIComponent(historicalSlug)}` : null;
}

export function parseCompletedSale(form: FormData, today: string) {
  const request = String(form.get("request") ?? "");
  const date = String(form.get("date") ?? "");
  const quantity = Number(String(form.get("quantity") ?? ""));
  const money = String(form.get("total") ?? "").trim();

  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(request)) {
    throw new Error("Volvé a abrir la ficha antes de guardar.");
  }
  const parsedDate = new Date(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.valueOf()) ||
    parsedDate.toISOString().slice(0, 10) !== date || date < "0001-01-01" || date > today) {
    throw new Error("Ingresá la fecha en que se realizó la venta.");
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) {
    throw new Error("Ingresá una cantidad entera mayor a cero.");
  }
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(money) || Number(money.replace(",", ".")) <= 0) {
    throw new Error("Ingresá el importe total, con hasta dos decimales.");
  }
  const total = Number(money.replace(",", "."));
  const cents = Math.round(total * 100);
  return { request, date, quantity, total, unitPrice: Math.round(cents / quantity) / 100 };
}
