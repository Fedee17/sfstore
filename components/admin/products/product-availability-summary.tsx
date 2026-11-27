import type { ReactNode } from "react";
import type { ProductAvailability } from "@/lib/products/product-availability";

function Line({ label, ok, state, reasons }: { label: string; ok: boolean; state: string; reasons: string[] }) {
  return (
    <p className="break-words">
      <span className="font-semibold">{label}:</span>{" "}
      <span className={ok ? "font-semibold text-[#556B2F]" : "font-semibold text-[#8B5E3C]"}>{state}</span>
      {reasons.length ? <span className="text-[#1F1F1F]/60"> · {reasons.join(" · ")}</span> : null}
    </p>
  );
}

/** Administrative status, web visibility and new-sale availability, each with its own reasons. */
export function ProductAvailabilitySummary({ availability, className = "", children }: { availability: ProductAvailability; className?: string; children?: ReactNode }) {
  return (
    <div className={`grid gap-0.5 text-xs ${className}`}>
      <Line label="Estado" ok={availability.statusLabel === "Activo"} state={availability.statusLabel} reasons={availability.historical ? ["Identidad histórica (sólo lectura)"] : []} />
      <Line label="Web" ok={availability.web.visible} state={availability.web.visible ? "Visible" : "No visible"} reasons={availability.web.reasons} />
      <Line label="Venta nueva" ok={availability.newSale.allowed} state={availability.newSale.allowed ? "Habilitada" : "No habilitada"} reasons={availability.newSale.reasons} />
      {children}
    </div>
  );
}
