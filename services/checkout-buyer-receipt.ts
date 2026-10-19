import "server-only";
import { authorizeCheckoutBuyer } from "@/services/checkout-server";
import { isUuid } from "@/lib/checkout/contract";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function getBuyerCheckoutReceipt(orderId: string) {
  if (!isUuid(orderId)) return null;
  try {
    const buyerId = await authorizeCheckoutBuyer();
    if (!buyerId) return null;
    const client = getSupabaseAdminClient();
    const { data, error } = await client.from("checkout_operations")
      .select("result, state, expires_at").eq("order_id",orderId).eq("buyer_id",buyerId).maybeSingle();
    if (error || !data) return null;
    const { data: payment, error: paymentError } = await client.from("orders").select("payment_status").eq("id",orderId).maybeSingle();
    if (paymentError) return null;
    const report = await client.from("checkout_payment_reports").select("status,reported_at,operation_key,rejection_reason").eq("order_id",orderId).eq("buyer_id",buyerId).maybeSingle();
    if(report.error) return null;
    const lines=await client.from("order_items").select("id,product_name,quantity,unit_price,subtotal,sku_snapshot,variant_options_snapshot").eq("order_id",orderId).order("id");
    if(lines.error)return null;
    return { lines: lines.data ?? [], report: report.data as {status:string;reported_at:string|null;operation_key:string;rejection_reason:string|null}|null, payment_status: String(payment?.payment_status ?? "pending"), id: orderId, order_number: String(data.result.orderNumber), total: Number(data.result.total), payment_method: (data.result.paymentMethod === "cash" ? "cash" : "transfer") as "transfer" | "cash",
      state: String(data.state), expiresAt: String(data.expires_at), expired: Date.parse(String(data.expires_at)) <= Date.now() };
  } catch { return null; }
}
