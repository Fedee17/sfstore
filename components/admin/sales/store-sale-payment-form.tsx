"use client";

import { useActionState } from "react";

import {
  addStoreSalePaymentAction,
  type StoreSaleActionState,
} from "@/app/admin/ventas/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";

const initialState: StoreSaleActionState = { status: "idle", message: "" };

export function StoreSalePaymentForm({
  orderId,
  remainingAmount,
  paymentSequence,
}: {
  orderId: string;
  remainingAmount: number;
  paymentSequence: number;
}) {
  const [state, action] = useActionState(addStoreSalePaymentAction, initialState);

  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paymentKey" value={String(paymentSequence)} />
      <label className="grid gap-2 text-sm font-semibold">
        Medio
        <select name="paymentMethod" className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4 outline-none focus:border-[#556B2F]">
          <option value="cash">Efectivo</option>
          <option value="transfer">Transferencia</option>
          <option value="card">Tarjeta</option>
          <option value="other">Otro</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Importe
        <input name="paymentAmount" inputMode="decimal" required defaultValue={remainingAmount.toFixed(2)} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4 outline-none focus:border-[#556B2F]" />
      </label>
      <PendingSubmitButton pendingLabel="Registrando..." className="h-12 rounded-2xl bg-[#556B2F] px-5 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:opacity-60">
        Agregar pago
      </PendingSubmitButton>
      {state.status !== "idle" ? (
        <p role={state.status === "error" ? "alert" : "status"} className={`text-sm font-semibold sm:col-span-3 ${state.status === "error" ? "text-[#8B5E3C]" : "text-[#556B2F]"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
