"use client";
import { useActionState, useState } from "react";
import { confirmPayment, releaseExpired } from "@/app/admin/checkout/actions";
import type { AdminCheckoutRow } from "@/services/checkout-manual-admin";
const initial = { message: "", ok: false };
export function ManualCheckoutPaymentForm({ order }: { order: AdminCheckoutRow }) {
  const [state, action, pending] = useActionState(confirmPayment,initial);
  const [operationKey] = useState(order.operation_key);
  return <form action={action} className="mt-3 grid gap-3">
    <input type="hidden" name="orderId" value={order.order_id} />
    <input type="hidden" name="operationKey" value={operationKey} />
    <label>Importe recibido completo<input className="ml-3 rounded border p-2" name="amount" inputMode="decimal" required /></label>
    <label>Referencia del cobro<input className="ml-3 rounded border p-2" name="reference" maxLength={200} required={order.result.paymentMethod !== "cash"} /></label>
    <label><input type="checkbox" name="received" required /> Verifiqué la transferencia o recibí el efectivo en el local.</label>
    <button disabled={pending || state.ok} className="rounded bg-[#102033] p-3 text-white">{pending ? "Registrando..." : "Acreditar pago manual"}</button>
    {state.message ? <p role="status">{state.message}</p> : null}
  </form>;
}
export function ReleaseCheckoutReservationsForm() {
  const [state,action,pending] = useActionState(releaseExpired,initial);
  return <form action={action} className="my-6"><p>Esta acción libera solamente reservas pendientes cuyo plazo ya venció. No activa ejecuciones periódicas.</p>
    <button disabled={pending} className="mt-3 rounded border p-3">{pending ? "Liberando..." : "Liberar reservas vencidas (hasta 100)"}</button>
    {state.message ? <p role="status">{state.message}</p> : null}</form>;
}
