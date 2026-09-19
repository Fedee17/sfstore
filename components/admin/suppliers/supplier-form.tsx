"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { SupplierActionState } from "@/app/admin/proveedores/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import type { Supplier } from "@/services/suppliers";

const initialState: SupplierActionState = { status: "idle", message: "" };

export function SupplierForm({
  action,
  supplier,
}: {
  action: (
    state: SupplierActionState,
    formData: FormData,
  ) => Promise<SupplierActionState>;
  supplier?: Supplier;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-8 grid gap-6">
      {supplier ? <input type="hidden" name="supplierId" value={supplier.id} /> : null}

      <section className="grid gap-5 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-6 shadow-sm md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          Nombre
          <input name="name" required defaultValue={supplier?.name ?? ""} autoFocus className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Nombre de contacto
          <input name="contactName" defaultValue={supplier?.contact_name ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Email
          <input name="email" type="email" defaultValue={supplier?.email ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Telefono
          <input name="phone" inputMode="tel" defaultValue={supplier?.phone ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          WhatsApp
          <input name="whatsapp" inputMode="tel" defaultValue={supplier?.whatsapp ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          Website
          <input name="website" type="url" placeholder="https://" defaultValue={supplier?.website ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          Direccion
          <input name="address" defaultValue={supplier?.address ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold md:col-span-2">
          Notas
          <textarea name="notes" rows={5} defaultValue={supplier?.notes ?? ""} className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] p-4 outline-none focus:border-[#556B2F]" />
        </label>
        {supplier ? (
          <label className="flex items-center gap-3 text-sm font-semibold md:col-span-2">
            <input name="isActive" type="checkbox" defaultChecked={supplier.is_active} className="size-5 accent-[#556B2F]" />
            Proveedor activo
          </label>
        ) : null}
      </section>

      {state.status !== "idle" ? (
        <p role={state.status === "error" ? "alert" : "status"} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${state.status === "error" ? "border border-[#8B5E3C]/25 bg-[#8B5E3C]/10 text-[#8B5E3C]" : "border border-[#556B2F]/20 bg-[#556B2F]/10 text-[#556B2F]"}`}>
          {state.message}
          {state.status === "success" && state.supplierId ? (
            <Link href={`/admin/proveedores/${state.supplierId}`} className="ml-2 underline">Ver proveedor</Link>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <Link href={supplier ? `/admin/proveedores/${supplier.id}` : "/admin/proveedores"} className="rounded-full border border-[#8B5E3C]/30 px-6 py-3 text-sm font-semibold text-[#8B5E3C] transition hover:bg-[#8B5E3C]/10">Cancelar</Link>
        <PendingSubmitButton pendingLabel="Guardando..." className="rounded-full bg-[#556B2F] px-7 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:opacity-60">
          Guardar
        </PendingSubmitButton>
      </div>
    </form>
  );
}
