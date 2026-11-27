import { movePrice, priceCents, type PriceMove } from "./bulk-price.ts";
import { getEffectiveCashPrice, getWebTransferPrice } from "../web-transfer-pricing.ts";

/** Same owner decision as bulk-price.ts (27/11/2026), applied to families: base, overrides and approved specials. */
export const BULK_FAMILY_LIMIT = 50;

export type FamilyVariantRow = {
  id: string; name: string; sku?: string | null; price: number | string; list_price_override: number | string | null;
  transfer_price: number | string | null; cash_price_approved_at: string | null; compare_at_price: number | string | null;
  historical_identity: boolean | null;
};
export type FamilyPriceRow = { id: string; name: string; slug: string; base_price: number | string; revision: number; variants: FamilyVariantRow[] };
export type FamilyVariantChange = {
  variant: FamilyVariantRow; inherits: boolean; list: PriceMove;
  special: ({ approved: true } & PriceMove) | { approved: false; fromCents: number; toCents: number };
};
export type FamilyPriceChange = { family: FamilyPriceRow; base: PriceMove; variants: FamilyVariantChange[] };
export type FamilyPricePlan = { change: FamilyPriceChange[]; skip: { family: FamilyPriceRow; reason: string }[]; tooMany: boolean; roundingCents: number };

/** What the preview read: any change in the family or its variants refuses the write. */
export function familyFingerprint(family: FamilyPriceRow) {
  return JSON.stringify([family.revision, String(family.base_price), [...family.variants].sort((a, b) => a.id.localeCompare(b.id))
    .map(v => [v.id, String(v.price), v.list_price_override === null ? null : String(v.list_price_override), v.transfer_price === null ? null : String(v.transfer_price), v.cash_price_approved_at])]);
}

function isApproved(v: FamilyVariantRow) {
  return v.cash_price_approved_at !== null && v.transfer_price !== null
    && getEffectiveCashPrice({ price: v.price, transfer_price: v.transfer_price, cash_price_approved_at: v.cash_price_approved_at }) === Number(v.transfer_price);
}

export function planBulkFamilyPrice(families: FamilyPriceRow[], bp: number): FamilyPricePlan {
  const plan: FamilyPricePlan = { change: [], skip: [], tooMany: false, roundingCents: 0 };
  for (const family of families) {
    const skip = (reason: string) => { plan.skip.push({ family, reason }); };
    if (family.variants.some(v => v.historical_identity !== false)) { skip("Tiene variantes históricas"); continue; }
    const baseFrom = priceCents(family.base_price);
    if (baseFrom <= 0) { skip("Sin precio base"); continue; }
    const base = movePrice(baseFrom, bp);
    if (base.toCents <= 0) { skip("El precio quedaría en $0 al redondear"); continue; }
    let reason: string | null = null;
    const variants = family.variants.map((variant): FamilyVariantChange => {
      const inherits = variant.list_price_override === null;
      const list = inherits ? { ...base, fromCents: priceCents(variant.price) } : movePrice(priceCents(variant.list_price_override!), bp);
      if (list.toCents <= 0) reason ??= "Una variante quedaría en $0 al redondear";
      const strike = variant.compare_at_price === null ? 0 : priceCents(variant.compare_at_price);
      if (strike > 0 && list.toCents >= strike) reason ??= "Una variante quedaría con el precio tachado menor o igual a la lista";
      if (isApproved(variant)) {
        const special = movePrice(priceCents(variant.transfer_price!), bp);
        if (special.toCents <= 0 || special.toCents > list.toCents) reason ??= "El precio especial de una variante quedaría mayor que la lista o en $0";
        return { variant, inherits, list, special: { approved: true, ...special } };
      }
      return { variant, inherits, list, special: { approved: false, fromCents: Math.round(getWebTransferPrice(Number(variant.price)) * 100), toCents: Math.round(getWebTransferPrice(list.toCents / 100) * 100) } };
    });
    if (reason) { skip(reason); continue; }
    const unchanged = base.toCents === base.fromCents && variants.every(v => v.list.toCents === v.list.fromCents && (!v.special.approved || v.special.toCents === v.special.fromCents));
    if (unchanged) { skip("Con el redondeo el precio queda igual"); continue; }
    plan.roundingCents += base.roundingCents + variants.reduce((sum, v) => sum + (v.inherits ? 0 : v.list.roundingCents) + (v.special.approved ? v.special.roundingCents : 0), 0);
    plan.change.push({ family, base, variants });
  }
  plan.tooMany = plan.change.length > BULK_FAMILY_LIMIT;
  return plan;
}
