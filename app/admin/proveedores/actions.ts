"use server";

import { revalidatePath } from "next/cache";

import { requireAdminActionSession } from "@/lib/admin-session";
import {
  createSupplier,
  setSupplierActiveStatus,
  updateSupplier,
} from "@/services/suppliers";

export type SupplierActionState = {
  status: "idle" | "success" | "error";
  message: string;
  supplierId?: string;
};

function supplierInput(formData: FormData, includeStatus = false) {
  return {
    name: String(formData.get("name") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    whatsapp: String(formData.get("whatsapp") ?? ""),
    website: String(formData.get("website") ?? ""),
    address: String(formData.get("address") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    ...(includeStatus ? { isActive: formData.get("isActive") === "on" } : {}),
  };
}

function revalidateSupplier(supplierId: string) {
  revalidatePath("/admin/proveedores");
  revalidatePath(`/admin/proveedores/${supplierId}`);
  revalidatePath(`/admin/proveedores/${supplierId}/editar`);
  revalidatePath("/admin/compras/nueva");
  revalidatePath("/admin/compras");
}

export async function createSupplierAdminAction(
  _previousState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  try {
    await requireAdminActionSession();
    const supplier = await createSupplier(supplierInput(formData));
    revalidateSupplier(supplier.id);
    return {
      status: "success",
      message: "Proveedor creado correctamente.",
      supplierId: supplier.id,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "No se pudo crear el proveedor.",
    };
  }
}

export async function updateSupplierAdminAction(
  _previousState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  try {
    await requireAdminActionSession();
    const supplierId = String(formData.get("supplierId") ?? "").trim();
    if (!supplierId) {
      throw new Error("Falta el ID del proveedor.");
    }

    const supplier = await updateSupplier(
      supplierId,
      supplierInput(formData, true),
    );
    revalidateSupplier(supplier.id);
    return {
      status: "success",
      message: "Cambios guardados correctamente.",
      supplierId: supplier.id,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "No se pudo actualizar el proveedor.",
    };
  }
}

export async function setSupplierActiveStatusAction(
  _previousState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  try {
    await requireAdminActionSession();
    const supplierId = String(formData.get("supplierId") ?? "").trim();
    const isActive = String(formData.get("isActive") ?? "") === "true";
    if (!supplierId) {
      throw new Error("Falta el ID del proveedor.");
    }

    await setSupplierActiveStatus(supplierId, isActive);
    revalidateSupplier(supplierId);
    return {
      status: "success",
      message: isActive ? "Proveedor activado." : "Proveedor desactivado.",
      supplierId,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "No se pudo cambiar el estado.",
    };
  }
}
