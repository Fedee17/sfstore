export type Family = { id: string; category_id: string; name: string; slug: string; base_price: number; revision: number };
export type FamilyOption = { id: string; name: string; values: { id: string; label: string }[] };
export type Variant = { id: string; name: string; sku: string; stock: number; cost: number | null; price: number; status: string;
  family_id: string; variant_choices: Record<string,string>; list_price_override: number | null; web_visible: boolean; commercial_blocked: boolean; version: string };
export type VariantActionState = { ok: boolean; message: string; familyId?: string };
export const initialVariantState: VariantActionState = { ok: false, message: "" };
export function readVariantMoney(value: FormDataEntryValue | null, optional = false) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text && optional) return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw new Error("Ingresá un importe válido con hasta dos decimales.");
  return Number(text);
}
export function variantAvailability(webVisible: boolean, blocked: boolean) {
  return blocked ? "Bloqueado en todos los canales" : webVisible ? "Web y mostrador (según estado y stock)" : "Sólo mostrador (según estado y stock)";
}
export function variantErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (/CATALOG_BUSY|55P03/.test(code)) return "Otro guardado está actualizando el catálogo. Reintentá sin cambiar los datos.";
  if (/STALE_VERSION/.test(code)) return "El registro cambió. Recargá la página antes de guardar.";
  if (/23505|unique|duplicate/.test(code)) return "Ya existe ese SKU, slug, opción o combinación de variantes.";
  if (/PRICE_MANAGED/.test(code)) return "El precio de este SKU se administra desde su familia.";
  if (/LINK_MUST_PRESERVE_PRICE/.test(code)) return "La asociación debe conservar el precio actual como excepción.";
  if (/IMMUTABLE|IN_USE/.test(code)) return "No se puede cambiar la identidad de una variante u opción utilizada. Creá otra combinación.";
  if (/OPTIONS_|CATEGORY_/.test(code)) return "Completá una combinación válida de opciones de esta familia y su categoría.";
  return "No se guardaron los cambios. Revisá los campos o recargá la página.";
}
