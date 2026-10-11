import "server-only";
import { getSupabaseAuthServerClient, hasCheckoutSessionCookie } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { CheckoutError, type CheckoutRequest, type CheckoutResult } from "@/lib/checkout/contract";

export async function authorizeCheckoutBuyer(): Promise<string | null> {
  const auth = await getSupabaseAuthServerClient({ checkout: true });
  const { data: { user }, error } = await auth.auth.getUser();
  if (!error && user) return user.id;
  if (await hasCheckoutSessionCookie()) return null;
  const legacy = await getSupabaseAuthServerClient();
  const previous = await legacy.auth.getUser();
  return previous.error ? null : previous.data.user?.id ?? null;
}
export async function createCheckoutOrder(buyerId: string, input: CheckoutRequest): Promise<CheckoutResult> {
  const { operationKey, ...request } = input;
  const { data, error } = await getSupabaseAdminClient().rpc("create_checkout_atomic", {
    p_buyer_id: buyerId, p_operation_key: operationKey, p_request: request,
  });
  if (error) {
    const codes: Record<string,number> = {
      CHECKOUT_NOT_CONFIGURED: 503, CHECKOUT_POLICY_NOT_CONFIGURED: 503, CHECKOUT_CASH_NOT_CONFIGURED: 409, CHECKOUT_AUTHORIZATION_NOT_IMPLEMENTED: 503,
      CHECKOUT_DELIVERY_NOT_CONFIGURED: 409, CHECKOUT_SHIPPING_QUOTE_REQUIRED: 409, CHECKOUT_SHIPPING_QUOTE_CHANGED: 409, CHECKOUT_INVALID_DESTINATION: 400, CHECKOUT_PRODUCT_UNAVAILABLE: 409,
      CHECKOUT_STOCK_INSUFFICIENT: 409, CHECKOUT_IDEMPOTENCY_CONFLICT: 409,
      CHECKOUT_INVALID_REQUEST: 400, CHECKOUT_INVALID_CUSTOMER: 400,
      CHECKOUT_INVALID_ITEMS: 400, CHECKOUT_DUPLICATE_PRODUCT: 400, CHECKOUT_INVALID_SHIPPING: 400,
      CHECKOUT_UNAUTHORIZED: 401,
    };
    const code = Object.keys(codes).find(code => error.message === code);
    throw new CheckoutError(code ?? "CHECKOUT_UNAVAILABLE", code ? codes[code] : 503);
  }
  if (!data) throw new CheckoutError("CHECKOUT_UNAVAILABLE",503);
  return data as CheckoutResult;
}
