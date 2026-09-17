"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  confirmPurchaseAction,
} from "@/app/admin/compras/actions";
import type { ConfirmPurchaseActionState } from "@/app/admin/compras/actions";

const CONFIRMATION_MESSAGE =
  "Al confirmar se sumará el stock y se actualizará el costo vigente de los productos. Esta acción no podrá editarse luego.";
const INITIAL_STATE: ConfirmPurchaseActionState = {
  status: "idle",
  message: "",
};

function ConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="rounded-full bg-[#556B2F] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F] disabled:cursor-not-allowed disabled:bg-[#D7D8D2] disabled:text-[#4A4A46]"
    >
      {pending ? "Confirmando..." : "Confirmar compra"}
    </button>
  );
}

export function ConfirmPurchaseForm({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    confirmPurchaseAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(CONFIRMATION_MESSAGE)) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-start gap-2"
    >
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <ConfirmButton />
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`max-w-sm text-sm ${
            state.status === "error" ? "text-red-700" : "text-[#556B2F]"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
