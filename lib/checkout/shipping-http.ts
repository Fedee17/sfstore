import { CheckoutError, isUuid, parseCheckoutRequest, type CheckoutRequest } from "./contract";
import { parseShippingDestination, type ShippingDestination } from "./argentina";
import { assertCheckoutOrigin, readCheckoutBody } from "./http";
export async function handleShippingAction(request: Request, dependencies: {
  authorize: () => Promise<string|null>;
  perform: (buyer: string, input: ShippingDestination | CheckoutRequest) => Promise<unknown>;
}, mode: "rates" | "request") {
  const headers = { "Cache-Control": "no-store" };
  try {
    assertCheckoutOrigin(request);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new CheckoutError("CHECKOUT_INVALID_REQUEST",415);
    const buyer = await dependencies.authorize();
    if (!isUuid(buyer)) throw new CheckoutError("CHECKOUT_UNAUTHORIZED",401);
    const input = mode === "rates" ? parseShippingDestination(await readCheckoutBody(request)) : parseCheckoutRequest(await readCheckoutBody(request));
    if ("shipping" in input) {
      if (input.shipping.method !== "shipping" || input.paymentMethod !== "transfer") throw new CheckoutError("CHECKOUT_INVALID_REQUEST",400);
      parseShippingDestination({ province: input.shipping.province, city: input.shipping.city, postalCode: input.shipping.postalCode });
    }
    return Response.json(await dependencies.perform(buyer,input),{ headers });
  } catch (error) {
    return Response.json({ code: error instanceof CheckoutError ? error.code : "CHECKOUT_UNAVAILABLE", error: "No se pudo procesar el envío. No se creó un pedido ni una reserva." },{ status: error instanceof CheckoutError ? error.status : 503, headers });
  }
}
