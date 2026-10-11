import { CheckoutError } from "./contract";
export const ARGENTINA_PROVINCES = ["Buenos Aires","Ciudad Autónoma de Buenos Aires","Catamarca","Chaco","Chubut","Córdoba","Corrientes","Entre Ríos","Formosa","Jujuy","La Pampa","La Rioja","Mendoza","Misiones","Neuquén","Río Negro","Salta","San Juan","San Luis","Santa Cruz","Santa Fe","Santiago del Estero","Tierra del Fuego","Tucumán"] as const;
export type ShippingDestination = { province: string; city: string; postalCode: string };
export type ShippingRate = { carrier: "Correo Argentino" | "Andreani" | "Via Cargo"; fee: number; quoteKey: string };
export type ShippingQuote = { status: "available" | "quotation_required"; country: "AR"; rates: ShippingRate[] };
export function parseShippingDestination(value: unknown): ShippingDestination {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CheckoutError("CHECKOUT_INVALID_DESTINATION",400);
  const input = value as Record<string,unknown>;
  if (Object.keys(input).some(key=>!["province","city","postalCode"].includes(key)) || !ARGENTINA_PROVINCES.some(province=>province===input.province)
    || ![input.city,input.postalCode].every(field=>typeof field === "string" && field.trim().length>0 && field.length<=300)) throw new CheckoutError("CHECKOUT_INVALID_DESTINATION",400);
  return { province: input.province as string, city: (input.city as string).trim(), postalCode: (input.postalCode as string).trim() };
}
