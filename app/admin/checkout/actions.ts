"use server";
import { revalidatePath } from "next/cache";
import { confirmManualCheckoutPayment, releaseExpiredCheckoutReservations, rejectReportedCheckoutPayment, authorizeBuyerException, approveShippingQuotation } from "@/services/checkout-manual-admin";
export type CheckoutAdminActionState = { message: string; ok: boolean };
export async function confirmPayment(_previous: CheckoutAdminActionState, form: FormData): Promise<CheckoutAdminActionState> {
  try {
    const raw = String(form.get("amount") ?? "").trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error("Importe inválido.");
    await confirmManualCheckoutPayment({ orderId: String(form.get("orderId") ?? ""), operationKey: String(form.get("operationKey") ?? ""),
      amount: Number(raw), reference: String(form.get("reference") ?? ""), received: form.get("received") === "on" });
    revalidatePath("/admin/checkout");
    return { ok: true, message: "Pago acreditado manualmente y reserva confirmada." };
  } catch { return { ok: false, message: "No se acreditó el pago. Revisá autorización, importe, referencia y estado antes de reintentar." }; }
}
export async function releaseExpired(): Promise<CheckoutAdminActionState> {
  try {
    const result = await releaseExpiredCheckoutReservations(); revalidatePath("/admin/checkout");
    return { ok: result.failures.length === 0, message: `Reservas liberadas: ${result.released}. Fallos pendientes: ${result.failures.length}.` };
  } catch { return { ok: false, message: "No se pudieron liberar reservas. Revisá autorización y disponibilidad antes de reintentar." }; }
}

export async function rejectPayment(_previous:CheckoutAdminActionState,form:FormData):Promise<CheckoutAdminActionState> {
 try {await rejectReportedCheckoutPayment(String(form.get("orderId")??""),String(form.get("reason")??""));revalidatePath("/admin/checkout");return{ok:true,message:"Aviso rechazado y reserva liberada."};}
 catch{return{ok:false,message:"No se rechazó el aviso. Revisá autorización, motivo y estado."};}
}
export async function setBuyerException(_previous:CheckoutAdminActionState,form:FormData):Promise<CheckoutAdminActionState> {
 try{await authorizeBuyerException(form);revalidatePath("/admin/checkout");return{ok:true,message:"Excepción temporal registrada con auditoría."};}
 catch{return{ok:false,message:"No se autorizó la excepción. Revisá límites, duración y motivo."};}
}

export async function approveShipping(_previous:CheckoutAdminActionState,form:FormData):Promise<CheckoutAdminActionState> {
 try {
  const raw=String(form.get("shippingFee")??"").trim().replace(",",".");if(!/^\d+(\.\d{1,2})?$/.test(raw))throw new Error("Importe inválido.");
  const result=await approveShippingQuotation(String(form.get("quoteId")??""),Number(raw));revalidatePath("/admin/checkout");
  return{ok:true,message:"Cotización registrada. Envío: $"+result.shippingFee.toFixed(2)+". Total con descuento: $"+result.total.toFixed(2)+". El comprador debe consultar y aceptar el total; todavía no hay pedido ni reserva."};
 }catch{return{ok:false,message:"No se registró la cotización. Revisá autorización, importe y solicitud."};}
}
