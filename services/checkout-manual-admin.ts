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
export type AdminCheckoutRow = { order_id: string; operation_key: string; state: string; expires_at: string; buyer_id:string; payment_status:string; report?:{status:string;reported_at:string;rejection_reason?:string;overdue:boolean}; history:{event:string;created_at:string;details:Record<string,unknown>}[]; result: { orderNumber: string; total: number; paymentMethod?: string } };
export async function listManualCheckoutOrders(page=0) {
  await requireAdminActionSession();
  const { data, error } = await getSupabaseAdminClient().from("checkout_operations")
    .select("order_id,buyer_id,state,expires_at,result").order("state",{ascending:false}).order("created_at",{ ascending: true }).range(page*100,page*100+99);
  if (error) throw new Error("No se pudieron leer los pedidos web.");
  const client=getSupabaseAdminClient();const ids=(data??[]).map(row=>row.order_id);
  if(!ids.length)return [];
  const [reports,audit,policy,payments]=await Promise.all([client.from("checkout_payment_reports").select("order_id,status,reported_at,rejection_reason").in("order_id",ids),client.from("checkout_audit").select("order_id,event,created_at,details").in("order_id",ids).order("created_at",{ascending:false}).limit(1000),client.from("checkout_reservation_policy").select("review_hours").eq("id",true).single(),client.from("orders").select("id,payment_status").in("id",ids)]);
  if(reports.error||audit.error||policy.error||payments.error)throw new Error("No se pudo leer la auditoría del checkout.");
  return (data??[]).map(row=>{const report=reports.data?.find(r=>r.order_id===row.order_id);return {...row,payment_status:payments.data?.find(p=>p.id===row.order_id)?.payment_status??"pending",operation_key:crypto.randomUUID(),report:report?{...report,overdue:report.status==="pending"&&Date.parse(report.reported_at)<Date.now()-policy.data.review_hours*3600000}:undefined,history:(audit.data??[]).filter(a=>a.order_id===row.order_id)};}) as AdminCheckoutRow[];
}

export async function listShippingQuotationRequests() {
  await requireAdminActionSession();
  const client = getSupabaseAdminClient();
  const { data,error } = await client.from("checkout_shipping_quote_requests").select("id,request,created_at,status,shipping_fee,quoted_total,valid_until,accepted_order_id").in("status",["requested","resolved"]).order("created_at",{ascending:false}).limit(100);
  if (error) throw new Error("No se pudieron leer las solicitudes de cotización.");
  const quotes = (data??[]) as {id:string;created_at:string;status:string;shipping_fee:number|null;quoted_total:number|null;valid_until:string|null;accepted_order_id:string|null;request:{customer:{fullName:string;phone:string;email?:string};shipping:{province:string;city:string;postalCode:string;address:string;carrier?:string};items:{productId:string;quantity:number}[]}}[];
  if (!quotes.length) return [];
  const ids = [...new Set(quotes.flatMap(quote=>quote.request.items.map(item=>item.productId)))];
  const products = await client.from("products").select("id,name").in("id",ids);
  if (products.error) throw new Error("No se pudieron leer los productos de las cotizaciones.");
  const names = new Map((products.data??[]).map(product=>[product.id,product.name]));
  return quotes.map(quote=>({...quote,items:quote.request.items.map(item=>({...item,name:names.get(item.productId)??"Producto no disponible"}))}));
}

export async function rejectReportedCheckoutPayment(orderId:string,reason:string) {
 const admin=await requireAdminActionSession();
 if(!isUuid(orderId)||reason.trim().length<5||reason.length>500)throw new Error("Motivo inválido.");
 const r=await getSupabaseAdminClient().rpc("reject_checkout_payment_report",{p_order_id:orderId,p_admin_id:admin.id,p_reason:reason.trim()});
 if(r.error)throw new Error("No se pudo rechazar y liberar la reserva.");
}
export async function authorizeBuyerException(form:FormData) {
 const admin=await requireAdminActionSession();const buyer=String(form.get("buyerId")??"");
 if(!isUuid(buyer))throw new Error("Comprador inválido.");
 const numbers=["hours","pending","units","productUnits","reports"].map(key=>Number(form.get(key)));
 if(numbers.some(n=>!Number.isInteger(n)||n<1))throw new Error("Límites inválidos.");
 const r=await getSupabaseAdminClient().rpc("set_checkout_buyer_exception",{p_buyer_id:buyer,p_admin_id:admin.id,p_hours:numbers[0],p_pending:numbers[1],p_units:numbers[2],p_product_units:numbers[3],p_reports:numbers[4],p_reason:String(form.get("reason")??"")});
 if(r.error)throw new Error("No se pudo autorizar la excepción.");
}

export type CheckoutExpirationHealth = {
  monitoringEnabled: boolean; intervalSeconds: number; due: number; oldestDueAt: string | null;
  protectedReports: number; lastProgressAt: string | null; heartbeatOverdue: boolean; backlogOverdue: boolean;
  lastRunStatus: string | null; recentRuns: { finished_at: string; status: string; released: number; due_after: number; failed_orders: number }[];
};
export async function getCheckoutExpirationHealth(): Promise<CheckoutExpirationHealth> {
  await requireAdminActionSession();
  const { data, error } = await getSupabaseAdminClient().rpc("get_checkout_expiration_health");
  if (error || !data) throw new Error("No se pudo consultar la supervisión de reservas.");
  return { ...data, backlogOverdue: data.backlogOverdue === true } as CheckoutExpirationHealth;
}

export async function approveShippingQuotation(quoteId:string,fee:number) {
 const admin=await requireAdminActionSession();
 if(!isUuid(quoteId)||!Number.isFinite(fee)||fee<0||fee>9999999||Math.round(fee*100)/100!==fee)throw new Error("Cotización inválida.");
 const {data,error}=await getSupabaseAdminClient().rpc("approve_checkout_shipping_quote",{p_quote_id:quoteId,p_admin_id:admin.id,p_fee:fee});
 if(error||!data)throw new Error("No se pudo registrar la cotización.");
 return data as {total:number;shippingFee:number};
}
