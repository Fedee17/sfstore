import { CheckoutError } from "@/lib/checkout/contract";
import { assertCheckoutOrigin, readCheckoutBody } from "@/lib/checkout/http";
import { ensureCheckoutGuestSession } from "@/services/checkout-guest-session";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    assertCheckoutOrigin(request);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new CheckoutError("CHECKOUT_INVALID_REQUEST",415);
    const input = await readCheckoutBody(request) as Record<string,unknown>;
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key=>!["captchaToken","hasPendingOperation"].includes(key))
      || typeof input.hasPendingOperation !== "boolean" || (input.captchaToken !== undefined && (typeof input.captchaToken !== "string" || !input.captchaToken.trim() || input.captchaToken.length>2048))) throw new CheckoutError("CHECKOUT_INVALID_REQUEST",400);
    return Response.json(await ensureCheckoutGuestSession({ hasPendingOperation: input.hasPendingOperation as boolean, captchaToken: input.captchaToken as string|undefined }),{ headers });
  } catch (error) {
    return Response.json({ code: error instanceof CheckoutError ? error.code : "CHECKOUT_SESSION_UNAVAILABLE", error: "No se pudo verificar tu sesión de compra. Conservá esta ventana y reintentá; si perdiste la sesión, contactá al local." },{ status: error instanceof CheckoutError ? error.status : 503, headers });
  }
}
