"use client";
import { useActionState, useState } from "react";
import { confirmPayment, releaseExpired, rejectPayment, setBuyerException, approveShipping } from "@/app/admin/checkout/actions";
import type { AdminCheckoutRow } from "@/services/checkout-manual-admin";
const initial = { message: "", ok: false };
export function ManualCheckoutPaymentForm({ order }: { order: AdminCheckoutRow }) {
  const [state, action, pending] = useActionState(confirmPayment,initial);
  const [operationKey] = useState(order.operation_key);
  return <form action={action} className="mt-3 grid gap-3">
    <input type="hidden" name="orderId" value={order.order_id} />
    <input type="hidden" name="operationKey" value={operationKey} />
    <label>Importe recibido completo<input className="ml-3 rounded border p-2" name="amount" inputMode="decimal" required /></label>
    <label>Referencia del cobro<input className="ml-3 rounded border p-2" name="reference" maxLength={200} required /></label>
    <label><input type="checkbox" name="received" required /> Verifiqué la acreditación bancaria del 100% del total. El comprobante por sí solo no acredita el pago.</label>
    <button disabled={pending || state.ok} className="rounded bg-[#102033] p-3 text-white">{pending ? "Registrando..." : "Acreditar pago manual"}</button>
    {state.message ? <p role="status">{state.message}</p> : null}
  </form>;
}
export function ReleaseCheckoutReservationsForm() {
  const [state,action,pending] = useActionState(releaseExpired,initial);
  return <form action={action} className="my-6"><p>Esta acción libera solamente reservas pendientes vencidas sin pago informado. No activa ejecuciones periódicas.</p>
    <button disabled={pending} className="mt-3 rounded border p-3">{pending ? "Liberando..." : "Liberar reservas vencidas (hasta 100)"}</button>
    {state.message ? <p role="status">{state.message}</p> : null}</form>;
}

export function RejectCheckoutPaymentForm({orderId}:{orderId:string}) {
 const [state,action,pending]=useActionState(rejectPayment,initial);
 return <form action={action} className="mt-5 grid gap-3"><input type="hidden" name="orderId" value={orderId}/><label>Motivo del rechazo<input name="reason" required minLength={5} maxLength={500}/></label><p>Rechazar cancela el pedido y libera el stock en una misma transacción. Verificá primero que no exista una acreditación real.</p><button disabled={pending||state.ok}>Rechazar aviso y liberar reserva</button>{state.message?<p role="status">{state.message}</p>:null}</form>;
}
export function CheckoutBuyerExceptionForm({buyerId}:{buyerId:string}) {
 const [state,action,pending]=useActionState(setBuyerException,initial);
 return <details className="mt-4"><summary>Autorizar excepción temporal para este comprador</summary><form action={action} className="grid gap-3"><input type="hidden" name="buyerId" value={buyerId}/><label>Duración en horas<input name="hours" type="number" min={1} max={24} defaultValue={2} required/></label><label>Pedidos pendientes permitidos<input name="pending" type="number" min={1} max={20} defaultValue={3} required/></label><label>Unidades totales reservadas<input name="units" type="number" min={1} max={100} defaultValue={8} required/></label><label>Unidades por producto<input name="productUnits" type="number" min={1} max={100} defaultValue={4} required/></label><label>Pagos informados simultáneos<input name="reports" type="number" min={1} max={20} defaultValue={2} required/></label><label>Motivo de la excepción<input name="reason" minLength={5} maxLength={500} required/></label><p>La excepción permite revisar bloqueos por rechazos o vencimientos. Mantiene los límites de frecuencia y la verificación del stock disponible.</p><button disabled={pending}>Autorizar excepción</button>{state.message?<p role="status">{state.message}</p>:null}</form></details>;
}

export function ShippingQuotationForm({quoteId}:{quoteId:string}) {
 const [state,action,pending]=useActionState(approveShipping,initial);
 return <form action={action} className="mt-4 grid gap-2"><input type="hidden" name="quoteId" value={quoteId}/><label>Costo de envío aprobado<input name="shippingFee" inputMode="decimal" required/></label><p>Registrá un costo verificado con el transporte elegido. No uses tarifas de ejemplo. El comprador podrá consultar el total en su sesión; coordiná el aviso por el contacto indicado. Registrar el costo no crea un pedido ni reserva stock.</p><button disabled={pending||state.ok}>Comunicar cotización en el checkout</button>{state.message?<p role="status">{state.message}</p>:null}</form>;
}
