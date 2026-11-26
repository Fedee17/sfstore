import { useMemo, useSyncExternalStore } from "react";

/** Owner request 20/11: the buyer picks the delivery type in its own step before the checkout form.
 *  The method travels in the URL; the shipping address (personal data) only in this tab's sessionStorage.
 *  The checkout validates and quotes exactly as before. */
export type DeliveryMethod = "pickup" | "shipping";
export const carriers = ["Correo Argentino", "Andreani", "Via Cargo"] as const;
export type Carrier = (typeof carriers)[number] | "";
export type ShippingAddress = { province: string; city: string; address: string; postalCode: string; carrier: Carrier };
export type ShippingAddressErrors = Partial<Record<keyof ShippingAddress, string>>;

const queryValues = { pickup: "retiro", shipping: "envio" } as const satisfies Record<DeliveryMethod, string>;
const draftKey = "sfstore-checkout-shipping";

export const deliveryStepHref = "/checkout/entrega";
export const emptyShippingAddress: ShippingAddress = { province: "", city: "", address: "", postalCode: "", carrier: "" };

export function deliveryChoiceHref(method: DeliveryMethod) {
  return `/checkout?payment=transfer&entrega=${queryValues[method]}`;
}

/** Unknown or missing values return null, so the checkout keeps asking instead of assuming a method. */
export function parseDeliveryChoice(value: string | null): DeliveryMethod | null {
  if (value === queryValues.pickup) return "pickup";
  if (value === queryValues.shipping) return "shipping";
  return null;
}

/** Single rule set for the delivery step and the checkout form. */
export function validateShippingAddress(value: ShippingAddress): ShippingAddressErrors {
  const errors: ShippingAddressErrors = {};
  if (!value.province.trim()) errors.province = "Ingresá la provincia.";
  if (!value.city.trim()) errors.city = "Ingresá la localidad.";
  if (!value.address.trim()) errors.address = "Ingresá la dirección.";
  if (!value.postalCode.trim()) errors.postalCode = "Ingresá el código postal.";
  if (!value.carrier) errors.carrier = "Elegí el transporte preferido.";
  return errors;
}

export function saveShippingDraft(value: ShippingAddress) {
  try { sessionStorage.setItem(draftKey, JSON.stringify(value)); } catch {}
}

const noSubscription = () => () => {};
function readDraftText() {
  try { return sessionStorage.getItem(draftKey); } catch { return null; }
}

/** Address saved in this tab by the delivery step (null on the server and before it exists). */
export function useShippingDraft() {
  const text = useSyncExternalStore(noSubscription, readDraftText, () => null);
  return useMemo(() => parseShippingDraft(text), [text]);
}

/** Returns the saved address only when it is complete and well formed; anything else is ignored. */
export function parseShippingDraft(text: string | null): ShippingAddress | null {
  try {
    const raw: unknown = JSON.parse(text ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const field = (key: keyof ShippingAddress) => typeof record[key] === "string" ? (record[key] as string).slice(0, 200) : "";
    const carrier = carriers.find(option => option === record.carrier) ?? "";
    const value: ShippingAddress = { province: field("province"), city: field("city"), address: field("address"), postalCode: field("postalCode"), carrier };
    return Object.keys(validateShippingAddress(value)).length ? null : value;
  } catch { return null; }
}

export function clearShippingDraft() {
  try { sessionStorage.removeItem(draftKey); } catch {}
}
