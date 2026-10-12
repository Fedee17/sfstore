import { CheckoutError, isUuid, parseCheckoutRequest, type CheckoutRequest, type CheckoutResult } from "./contract";

export type CheckoutDependencies = {
  authorize: () => Promise<string | null>;
  create: (buyerId: string, request: CheckoutRequest) => Promise<CheckoutResult>;
};
// NextURL normalizes loopback hostnames; Host retains the browser's authority.
// Compare the exact origin, never forwarded headers or equivalent host aliases.
export function assertCheckoutOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  let expected = url.origin;
  if (host !== null) {
    let authority: URL;
    try { authority = new URL(`${url.protocol}//${host}`); }
    catch { throw new CheckoutError("CHECKOUT_ORIGIN_DENIED",403); }
    if (authority.host !== host.toLowerCase() || authority.username || authority.password || authority.pathname !== "/" || authority.search || authority.hash)
      throw new CheckoutError("CHECKOUT_ORIGIN_DENIED",403);
    expected = authority.origin;
  }
  if (request.headers.get("origin") !== expected) throw new CheckoutError("CHECKOUT_ORIGIN_DENIED",403);
}
// Bounded streaming read; Content-Length alone is not a trustworthy limit.
export async function readCheckoutBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new CheckoutError("CHECKOUT_INVALID_REQUEST",400);
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) { await reader.cancel(); throw new CheckoutError("CHECKOUT_REQUEST_TOO_LARGE",413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes); let position = 0;
  for (const chunk of chunks) { body.set(chunk,position); position += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8",{ fatal: true }).decode(body)) as unknown; }
  catch { throw new CheckoutError("CHECKOUT_INVALID_REQUEST",400); }
}
export async function handleCheckout(request: Request, dependencies: CheckoutDependencies): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    assertCheckoutOrigin(request);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new CheckoutError("CHECKOUT_INVALID_REQUEST",415);
    const buyer = await dependencies.authorize();
    if (!isUuid(buyer)) throw new CheckoutError("CHECKOUT_UNAUTHORIZED",401);
    const input = parseCheckoutRequest(await readCheckoutBody(request));
    const result = await dependencies.create(buyer,input);
    return Response.json(result,{ headers });
  } catch (error) {
    // Never expose Supabase diagnostics, credentials, request contents or PII.
    const known = error instanceof CheckoutError;
    return Response.json({ code: known ? error.code : "CHECKOUT_UNAVAILABLE", error: "No se pudo preparar el pedido. Revisá la disponibilidad e intentá nuevamente." },
      { status: known ? error.status : 503, headers });
  }
}
