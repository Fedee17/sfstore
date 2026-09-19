"use client";

import { useActionState } from "react";

import {
  setSupplierActiveStatusAction,
  type SupplierActionState,
} from "@/app/admin/proveedores/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";

const initialState: SupplierActionState = { status: "idle", message: "" };

export function SupplierStatusForm({
  supplierId,
  isActive,
}: {
  supplierId: string;
  isActive: boolean;
}) {
  const [state, action] = useActionState(
    setSupplierActiveStatusAction,
    initialState,
  );
  const nextStatus = !isActive;

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="isActive" value={String(nextStatus)} />
      <PendingSubmitButton pendingLabel={nextStatus ? "Activando..." : "Desactivando..."} className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-sm font-semibold text-[#8B5E3C] transition hover:bg-[#8B5E3C]/10 disabled:cursor-not-allowed disabled:opacity-60">
        {nextStatus ? "Activar proveedor" : "Desactivar proveedor"}
      </PendingSubmitButton>
      {state.status !== "idle" ? (
        <p role={state.status === "error" ? "alert" : "status"} className={`text-sm font-semibold ${state.status === "error" ? "text-[#8B5E3C]" : "text-[#556B2F]"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
