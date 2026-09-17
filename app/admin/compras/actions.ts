"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminActionSession } from "@/lib/admin-session";
import {
  cancelPurchaseDraft,
  createSupplier,
  savePurchaseDraft,
} from "@/services/purchases";

function readPurchaseLines(formData: FormData) {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const unitCosts = formData.getAll("unitPurchaseCost").map(String);

  if (
    productIds.length !== quantities.length ||
    productIds.length !== unitCosts.length
  ) {
    throw new Error("Las lineas de la compra estan incompletas.");
  }

  return productIds.map((productId, index) => ({
    productId,
    quantity: Number(quantities[index]),
    unitPurchaseCost: unitCosts[index],
  }));
}

export async function createSupplierAction(formData: FormData) {
  await requireAdminActionSession();
  await createSupplier({
    name: String(formData.get("name") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });

  revalidatePath("/admin/compras/nueva");
  redirect("/admin/compras/nueva?supplierCreated=1");
}

export async function savePurchaseDraftAction(formData: FormData) {
  const user = await requireAdminActionSession();
  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const savedId = await savePurchaseDraft({
    purchaseId: purchaseId || undefined,
    supplierId: String(formData.get("supplierId") ?? ""),
    purchaseDate: String(formData.get("purchaseDate") ?? ""),
    shippingCost: String(formData.get("shippingCost") ?? "0"),
    notes: String(formData.get("notes") ?? ""),
    createdBy: user.id,
    lines: readPurchaseLines(formData),
  });

  revalidatePath("/admin/compras");
  revalidatePath(`/admin/compras/${savedId}`);
  redirect(`/admin/compras/${savedId}`);
}

export async function cancelPurchaseDraftAction(formData: FormData) {
  await requireAdminActionSession();
  const purchaseId = String(formData.get("purchaseId") ?? "").trim();

  if (!purchaseId) {
    throw new Error("Falta el ID de la compra.");
  }

  await cancelPurchaseDraft(purchaseId);
  revalidatePath("/admin/compras");
  revalidatePath(`/admin/compras/${purchaseId}`);
  redirect(`/admin/compras/${purchaseId}`);
}
