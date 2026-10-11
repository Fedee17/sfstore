import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { authorizeCheckoutBuyer } from "@/services/checkout-server";
import { CheckoutError, isUuid, type CheckoutRequest } from "@/lib/checkout/contract";
import type { ShippingDestination, ShippingQuote } from "@/lib/checkout/argentina";
function fail(message?: string): never {
  const status: Record<string,number> = { CHECKOUT_INVALID_DESTINATION:400, CHECKOUT_NOT_CONFIGURED:503, CHECKOUT_POLICY_NOT_CONFIGURED:503, CHECKOUT_AUTHORIZATION_NOT_IMPLEMENTED:503, CHECKOUT_IDEMPOTENCY_CONFLICT:409, CHECKOUT_PRODUCT_UNAVAILABLE:409 };
  const code = message && status[message] ? message : "CHECKOUT_UNAVAILABLE";
  throw new CheckoutError(code,status[code]??503);
}
export async function getCheckoutShippingQuote(buyer: string, destination: ShippingDestination): Promise<ShippingQuote> {
  const { data,error } = await getSupabaseAdminClient().rpc("get_checkout_shipping_quote",{ p_buyer_id:buyer,p_destination:destination });
  if (error || !data) fail(error?.message);
  return data as ShippingQuote;
}
export async function requestCheckoutShippingQuotation(buyer: string, input: CheckoutRequest) {
  const { operationKey,...request } = input;
  const { data,error } = await getSupabaseAdminClient().rpc("request_checkout_shipping_quote",{ p_buyer_id:buyer,p_operation_key:operationKey,p_request:request });
  if (error || !data) fail(error?.message);
  return data as { id:string; status:string; createsOrder:false };
}
export async function getBuyerShippingQuotation(id: string) {
  if (!isUuid(id)) return null;
  const buyer = await authorizeCheckoutBuyer();
  if (!buyer) return null;
  const { data,error } = await getSupabaseAdminClient().from("checkout_shipping_quote_requests").select("id,status,created_at").eq("id",id).eq("buyer_id",buyer).maybeSingle();
  if (error) return null;
  return data;
}
