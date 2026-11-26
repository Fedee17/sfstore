import { MAX_INSTALLMENTS } from "@/lib/products/commercial-pricing";

// Card installments are not an enabled payment method: checkout only accepts transfer (lib/checkout/contract.ts)
// and the cart stores no payment modality. Turn this on only together with that integration.
const INSTALLMENTS_PAYMENT_ENABLED = false;

/**
 * Number of installments the product page may advertise, or null when none may be shown.
 * `developmentPreview` lets a local development server render the approved design with installments;
 * production builds ignore it.
 */
export function getPublicInstallments(developmentPreview = false): number | null {
  if (INSTALLMENTS_PAYMENT_ENABLED) return MAX_INSTALLMENTS;
  return developmentPreview && process.env.NODE_ENV === "development" ? MAX_INSTALLMENTS : null;
}
