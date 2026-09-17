"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminActionSession } from "@/lib/admin-session";
import {
  cancelPurchaseDraft,
  confirmPurchase,
  createPurchaseProduct,
  createSupplier,
  savePurchaseDraft,
} from "@/services/purchases";
import type { PurchaseProduct } from "@/services/purchases";

export type CreatePurchaseProductActionResult = {
  status: "idle" | "created" | "existing" | "error";
  message: string;
  product?: PurchaseProduct;
};

export type ConfirmPurchaseActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

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

export async function createPurchaseProductAction(input: {
  name: string;
  categoryId: string;
  sku?: string;
  purchaseId?: string;
}): Promise<CreatePurchaseProductActionResult> {
  await requireAdminActionSession();

  try {
    const result = await createPurchaseProduct(input);

    revalidatePath("/admin/productos");
    revalidatePath("/admin/consulta");
    revalidatePath("/admin/compras/nueva");

    if (input.purchaseId) {
      revalidatePath(`/admin/compras/${input.purchaseId}/editar`);
    }

    return {
      status: result.created ? "created" : "existing",
      message: result.created
        ? "Producto creado y agregado a la compra."
        : "Ya existe un producto con ese nombre. Podés agregarlo a la compra.",
      product: result.product,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo crear el producto.",
    };
  }
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

export async function confirmPurchaseAction(
  _previousState: ConfirmPurchaseActionState,
  formData: FormData,
): Promise<ConfirmPurchaseActionState> {
  try {
    const user = await requireAdminActionSession();
    const purchaseId = String(formData.get("purchaseId") ?? "").trim();

    if (!purchaseId) {
      throw new Error("Falta el ID de la compra.");
    }

    const result = await confirmPurchase(purchaseId, user.id);

    revalidatePath("/admin/compras");
    revalidatePath(`/admin/compras/${purchaseId}`);
    revalidatePath("/admin/productos");
    revalidatePath("/admin/consulta");

    return {
      status: "success",
      message:
        result.status === "already_confirmed"
          ? "La compra ya estaba confirmada; no se duplicaron stock ni movimientos."
          : "Compra confirmada. El stock y los costos vigentes fueron actualizados.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo confirmar la compra.",
    };
  }
}
