"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  updateProductStock,
  type InventoryAdjustmentActionState,
} from "@/app/admin/productos/actions";

const INITIAL_STATE: InventoryAdjustmentActionState = {
  status: "idle",
  message: "",
};

const REASON_SUGGESTIONS = [
  "Conteo fisico",
  "Producto danado",
  "Error de carga",
  "Diferencia de inventario",
  "Otro",
];

function AdjustStockButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="h-11 w-full rounded-2xl bg-[#556B2F] px-4 text-xs font-semibold text-white transition hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F] disabled:cursor-not-allowed disabled:bg-[#D7D8D2] disabled:text-[#4A4A46]"
    >
      {pending ? "Ajustando..." : "Guardar ajuste"}
    </button>
  );
}

export function InventoryAdjustmentForm({
  productId,
  productName,
  productSlug,
  currentStock,
}: {
  productId: string;
  productName: string;
  productSlug: string;
  currentStock: number;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateProductStock, INITIAL_STATE);
  const displayedStock = state.newStock ?? currentStock;

  useEffect(() => {
    if (state.status === "success" || state.status === "no_change") {
      router.refresh();
    }
  }, [router, state.movementId, state.newStock, state.status]);

  return (
    <div className="grid min-w-0 gap-3">
      <form action={formAction} className="grid min-w-0 gap-3">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="slug" value={productSlug} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#8B5E3C]/15 bg-white/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8B5E3C]">
              Stock actual
            </p>
            <p className="mt-1 text-lg font-semibold">{displayedStock}</p>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-[#1F1F1F]/70">
            Nuevo stock
            <input
              key={displayedStock}
              name="newStock"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={displayedStock}
              aria-label={`Nuevo stock de ${productName}`}
              className="h-11 w-full min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-white/80 px-4 text-sm font-semibold outline-none transition focus:border-[#556B2F]"
            />
          </label>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-[#1F1F1F]/70">
          Motivo del ajuste
          <input
            name="reason"
            list={`inventory-reasons-${productId}`}
            required
            minLength={2}
            placeholder="Ej: Conteo fisico"
            className="h-11 w-full min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-white/80 px-4 text-sm font-medium outline-none transition focus:border-[#556B2F]"
          />
          <datalist id={`inventory-reasons-${productId}`}>
            {REASON_SUGGESTIONS.map((reason) => (
              <option key={reason} value={reason} />
            ))}
          </datalist>
        </label>

        <AdjustStockButton />
      </form>

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-xs font-semibold ${
            state.status === "error" ? "text-red-700" : "text-[#556B2F]"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <Link
        href={`/admin/inventario?product=${productId}`}
        className="text-center text-xs font-semibold text-[#8B5E3C] underline-offset-4 hover:underline"
      >
        Ver movimientos
      </Link>
    </div>
  );
}
