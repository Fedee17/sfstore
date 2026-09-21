"use client";

import { useActionState } from "react";

import {
  addCustomerOrderPaymentAction,
  deliverCustomerOrderAction,
  transitionCustomerOrderAction,
  type CustomerOrderActionState,
} from "@/app/admin/pedidos/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import {
  CUSTOMER_ORDER_STATUS_LABELS,
  CUSTOMER_ORDER_TRANSITIONS,
  type CustomerOrderStatus,
} from "@/lib/orders/workflow";

const initialState: CustomerOrderActionState = { status: "idle", message: "" };

function Feedback({ state }: { state: CustomerOrderActionState }) {
  if (state.status === "idle") return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={`text-sm font-semibold ${state.status === "error" ? "text-[#8B5E3C]" : "text-[#556B2F]"}`}>{state.message}</p>;
}

export function CustomerOrderPaymentForm({ orderId, remainingAmount, paymentSequence }: { orderId: string; remainingAmount: number; paymentSequence: number }) {
  const [state, action] = useActionState(addCustomerOrderPaymentAction, initialState);
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paymentKey" value={String(paymentSequence)} />
      <label className="grid gap-2 text-sm font-semibold">Medio<select name="paymentMethod" className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></label>
      <label className="grid gap-2 text-sm font-semibold">Importe<input name="paymentAmount" inputMode="decimal" required defaultValue={remainingAmount.toFixed(2)} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4" /></label>
      <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Nota opcional<input name="paymentNotes" className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4" /></label>
      <div className="flex items-center justify-between gap-3 sm:col-span-2"><Feedback state={state} /><PendingSubmitButton pendingLabel="Registrando..." className="rounded-full bg-[#556B2F] px-6 py-3 text-sm font-semibold text-[#F7F4ED]">Registrar pago</PendingSubmitButton></div>
    </form>
  );
}

export function CustomerOrderStatusActions({ orderId, status, paymentStatus }: { orderId: string; status: CustomerOrderStatus; paymentStatus: string }) {
  const [transitionState, transitionAction] = useActionState(transitionCustomerOrderAction, initialState);
  const [deliveryState, deliveryAction] = useActionState(deliverCustomerOrderAction, initialState);
  const transitions = CUSTOMER_ORDER_TRANSITIONS[status].filter((next) => next !== "delivered");
  const canDeliver = status === "ready";

  return (
    <div className="grid gap-4">
      {transitions.length ? <form action={transitionAction} className="flex flex-wrap gap-3"><input type="hidden" name="orderId" value={orderId} />{transitions.map((next) => <PendingSubmitButton key={next} name="nextStatus" value={next} pendingLabel="Actualizando..." className={`rounded-full px-5 py-3 text-sm font-semibold ${next === "cancelled" ? "border border-[#8B5E3C]/30 text-[#8B5E3C]" : "bg-[#556B2F] text-[#F7F4ED]"}`}>{next === "cancelled" ? "Cancelar pedido" : `Pasar a ${CUSTOMER_ORDER_STATUS_LABELS[next]}`}</PendingSubmitButton>)}</form> : null}
      {status === "ready" ? <p className="text-sm text-[#8B5E3C]">Cancelar un pedido listo no revierte pagos automáticamente.</p> : null}
      <Feedback state={transitionState} />
      {canDeliver ? <form action={deliveryAction} className="grid gap-2"><input type="hidden" name="orderId" value={orderId} /><PendingSubmitButton disabled={paymentStatus !== "paid"} pendingLabel="Entregando..." className="w-fit rounded-full bg-[#556B2F] px-6 py-3 text-sm font-semibold text-[#F7F4ED] disabled:cursor-not-allowed disabled:opacity-45">Entregar pedido</PendingSubmitButton>{paymentStatus !== "paid" ? <p className="text-sm text-[#8B5E3C]">Para entregar, el pago debe estar completo.</p> : null}<Feedback state={deliveryState} /></form> : null}
    </div>
  );
}
