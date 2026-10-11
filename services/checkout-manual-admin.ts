import "server-only";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/checkout/contract";

export type ManualPaymentInput = { orderId: string; operationKey: string; amount: number; reference: string; received: boolean };
export async function confirmManualCheckoutPayment(input: ManualPaymentInput) {
  const admin = await requireAdminActionSession();
  if (!isUuid(input.orderId) || !isUuid(input.operationKey) || !input.received || !Number.isFinite(input.amount)
    || input.amount <= 0 || Math.round(input.amount * 100) / 100 !== input.amount || input.reference.length > 200) throw new Error("Datos de confirmación inválidos.");
  const { data, error } = await getSupabaseAdminClient().rpc("confirm_checkout_manual_payment", {
    p_order_id: input.orderId, p_operation_key: input.operationKey, p_admin_id: admin.id,
    p_amount: input.amount, p_reference: input.reference.trim() || null,
  });
  if (error || !data) throw new Error("No se pudo acreditar el pago. Verificá importe, referencia, vencimiento y estado del pedido antes de reintentar.");
  return data;
}
export async function releaseExpiredCheckoutReservations() {
  await requireAdminActionSession();
  const { data, error } = await getSupabaseAdminClient().rpc("expire_checkout_reservations", { p_limit: 100 });
  if (error || !data) throw new Error("No se pudieron liberar las reservas vencidas.");
  return data as { released: number; failures: { orderId: string; code: string }[] };
}
export type AdminCheckoutRow = { order_id: string; operation_key: string; state: string; expires_at: string; result: { orderNumber: string; total: number; paymentMethod?: string } };
export async function listManualCheckoutOrders() {
  await requireAdminActionSession();
  const { data, error } = await getSupabaseAdminClient().from("checkout_operations")
    .select("order_id,state,expires_at,result").order("created_at",{ ascending: false }).limit(100);
  if (error) throw new Error("No se pudieron leer los pedidos web.");
  return (data ?? []).map(row => ({ ...row, operation_key: crypto.randomUUID() })) as AdminCheckoutRow[];
}

export async function listShippingQuotationRequests() {
  await requireAdminActionSession();
  const client = getSupabaseAdminClient();
  const { data,error } = await client.from("checkout_shipping_quote_requests").select("id,request,created_at").eq("status","requested").order("created_at",{ascending:false}).limit(100);
  if (error) throw new Error("No se pudieron leer las solicitudes de cotización.");
  const quotes = (data??[]) as {id:string;created_at:string;request:{customer:{fullName:string;phone:string;email?:string};shipping:{province:string;city:string;postalCode:string;address:string};items:{productId:string;quantity:number}[]}}[];
  if (!quotes.length) return [];
  const ids = [...new Set(quotes.flatMap(quote=>quote.request.items.map(item=>item.productId)))];
  const products = await client.from("products").select("id,name").in("id",ids);
  if (products.error) throw new Error("No se pudieron leer los productos de las cotizaciones.");
  const names = new Map((products.data??[]).map(product=>[product.id,product.name]));
  return quotes.map(quote=>({...quote,items:quote.request.items.map(item=>({...item,name:names.get(item.productId)??"Producto no disponible"}))}));
}
