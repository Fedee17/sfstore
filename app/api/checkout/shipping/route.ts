import { handleShippingAction } from "@/lib/checkout/shipping-http";
import type { ShippingDestination } from "@/lib/checkout/argentina";
import { authorizeCheckoutBuyer } from "@/services/checkout-server";
import { getCheckoutShippingQuote } from "@/services/checkout-shipping";
export async function POST(request: Request) {
  return handleShippingAction(request,{ authorize:authorizeCheckoutBuyer,perform:(buyer,input)=>getCheckoutShippingQuote(buyer,input as ShippingDestination) },"rates");
}
