import { handleCheckout } from "@/lib/checkout/http";
import { authorizeCheckoutBuyer, createCheckoutOrder } from "@/services/checkout-server";
import { isMercadoPagoEnabled } from "@/lib/payments/mercadopago";

export async function POST(request: Request) {
  return handleCheckout(request, { authorize: authorizeCheckoutBuyer, create: createCheckoutOrder, mercadopagoEnabled: isMercadoPagoEnabled(process.env) });
}
