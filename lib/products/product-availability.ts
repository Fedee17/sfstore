import { resolvePublicCatalogSection } from "../catalog/public-product-visibility.ts";

/**
 * One reading of the four independent product dimensions for the admin: administrative status, web visibility,
 * commercial block and historical identity. It only explains the rules the database and the store sale form already
 * enforce (`listStoreSaleProducts`, the public catalog view); it never decides a sale by itself.
 */
export type ProductAvailabilityInput = {
  status: string;
  historicalIdentity: boolean;
  webVisible: boolean;
  commercialBlocked: boolean;
  categorySlug: string | null | undefined;
  categoryIsActive: boolean;
  stock: number;
};

export type ProductAvailability = {
  statusLabel: string;
  historical: boolean;
  web: { visible: boolean; reasons: string[] };
  newSale: { allowed: boolean; reasons: string[] };
};

const STATUS_LABELS: Record<string, string> = { draft: "Borrador", active: "Activo", archived: "Archivado" };
const STATUS_REASONS: Record<string, string> = { draft: "En borrador", archived: "Archivado" };

export function describeProductAvailability(product: ProductAvailabilityInput): ProductAvailability {
  // Reasons shared by both channels, in the order an admin resolves them.
  const shared: string[] = [];
  if (product.historicalIdentity) shared.push("Identidad histórica: sólo conserva registros");
  if (product.status !== "active") shared.push(STATUS_REASONS[product.status] ?? "Estado desconocido");
  if (product.commercialBlocked) shared.push("Bloqueado para nuevas ventas");

  const newSale = [...shared];
  if (!(product.stock > 0)) newSale.push("Sin stock");

  const web = [...shared];
  if (!product.webVisible) web.push("Oculto en la web");
  if (!product.categorySlug) web.push("Sin categoría");
  else if (!product.categoryIsActive) web.push("Categoría inactiva");

  return {
    statusLabel: STATUS_LABELS[product.status] ?? "Estado desconocido",
    historical: product.historicalIdentity,
    web: { visible: web.length === 0 && resolvePublicCatalogSection(product) !== null, reasons: web },
    newSale: { allowed: newSale.length === 0, reasons: newSale },
  };
}

type AdminProductAvailabilityRow = {
  status: string;
  stock: number;
  web_visible?: boolean;
  commercial_blocked?: boolean;
  historical_identity?: boolean;
  categories: { slug: string; is_active?: boolean } | null;
};

/** Admin rows: a column that was not read counts as blocked and hidden, never as enabled. */
export function adminProductAvailability(product: AdminProductAvailabilityRow) {
  return describeProductAvailability({
    status: product.status,
    historicalIdentity: product.historical_identity === true,
    webVisible: product.web_visible === true,
    commercialBlocked: product.commercial_blocked !== false,
    categorySlug: product.categories?.slug,
    categoryIsActive: product.categories?.is_active === true,
    stock: product.stock,
  });
}
