import { handleCheckout } from "@/lib/checkout/http";
import { authorizeCheckoutBuyer, createCheckoutOrder } from "@/services/checkout-server";

export async function POST(request: Request) {
  return handleCheckout(request, { authorize: authorizeCheckoutBuyer, create: createCheckoutOrder });
}
