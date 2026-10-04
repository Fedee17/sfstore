"use server";

import { revalidatePath } from "next/cache";

import { requireAdminActionSession } from "@/lib/admin-session";
import {
  parseStoreSalePaymentAmount,
  parseStoreSaleUnitPrice,
} from "@/lib/store-sales";
import type { OrderPaymentStatus } from "@/services/order-payments";
import {
  addStoreSalePayment,
  createStoreSale,
} from "@/services/store-sales";

export type StoreSaleActionState = {
  status: "idle" | "success" | "error";
  message: string;
  orderId?: string;
  paymentStatus?: OrderPaymentStatus;
};

const initialError = "No se pudo registrar la venta.";
const allowedPaymentMethods = new Set(["cash", "transfer", "card", "other"]);

function parsePaymentAmount(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return 0;
  }

  return parseStoreSalePaymentAmount(raw);
}

function readItems(formData: FormData) {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(Number);
  const unitPrices = formData
    .getAll("unitPrice")
    .map((value) => parseStoreSaleUnitPrice(String(value)));

  if (
    productIds.length !== quantities.length ||
    productIds.length !== unitPrices.length
  ) {
    throw new Error("Las lineas de la venta estan incompletas.");
  }

  return productIds.map((productId, index) => ({
    productId: productId.trim(),
    quantity: quantities[index],
    unitPrice: unitPrices[index],
  }));
}

function readPayments(formData: FormData) {
  const methods = formData.getAll("paymentMethod").map(String);
  const amounts = formData.getAll("paymentAmount").map(parsePaymentAmount);

  if (methods.length !== amounts.length) {
    throw new Error("Los medios de pago estan incompletos.");
  }

  return methods
    .map((method, index) => ({ method, amount: amounts[index] }))
    .filter((payment) => payment.amount > 0)
    .map((payment) => {
      if (!allowedPaymentMethods.has(payment.method)) {
        throw new Error("El medio de pago no es valido.");
      }

      return payment as {
        method: "cash" | "transfer" | "card" | "other";
        amount: number;
      };
    });
}

function revalidateStoreSale(orderId: string) {
  revalidatePath("/admin/ventas");
  revalidatePath(`/admin/ventas/${orderId}`);
  revalidatePath("/admin/productos");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/consulta");
}

export async function createStoreSaleAction(
  _previousState: StoreSaleActionState,
  formData: FormData,
): Promise<StoreSaleActionState> {
  let orderId: string | undefined;

  try {
    const user = await requireAdminActionSession();
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

    if (!idempotencyKey) {
      throw new Error("Falta la clave de seguridad de la operacion.");
    }

    const items = readItems(formData);
    const payments = readPayments(formData);

    const sale = await createStoreSale({
      idempotencyKey,
      createdBy: user.id,
      customerName: String(formData.get("customerName") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      items,
      payments,
    });
    orderId = sale.order_id;
    const paymentStatus = sale.payment_status;

    revalidateStoreSale(orderId);

    return {
      status: "success",
      orderId,
      paymentStatus,
      message:
        paymentStatus === "paid"
          ? "Venta completada. El stock fue actualizado."
          : paymentStatus === "partial"
            ? "Pago parcial registrado. El stock todavia no fue descontado."
            : "Venta registrada sin pagos. El stock todavia no fue descontado.",
    };
  } catch (error) {
    if (orderId) {
      revalidateStoreSale(orderId);
    }

    return {
      status: "error",
      orderId,
      message: error instanceof Error ? error.message : initialError,
    };
  }
}

export async function addStoreSalePaymentAction(
  _previousState: StoreSaleActionState,
  formData: FormData,
): Promise<StoreSaleActionState> {
  const orderId = String(formData.get("orderId") ?? "").trim();

  try {
    const user = await requireAdminActionSession();
    const method = String(formData.get("paymentMethod") ?? "");
    const paymentKey = String(formData.get("paymentKey") ?? "").trim();
    const amount = parsePaymentAmount(formData.get("paymentAmount"));

    if (!orderId || !paymentKey) {
      throw new Error("Faltan datos para registrar el pago.");
    }

    if (amount <= 0) {
      throw new Error("El importe del pago debe ser mayor que cero.");
    }

    if (!allowedPaymentMethods.has(method)) {
      throw new Error("El medio de pago no es valido.");
    }

    const payment = await addStoreSalePayment({
      orderId,
      createdBy: user.id,
      method: method as "cash" | "transfer" | "card" | "other",
      amount,
      reference: `store:${orderId}:payment:${paymentKey}`,
    });

    revalidateStoreSale(orderId);

    return {
      status: "success",
      orderId,
      paymentStatus: payment.payment_status,
      message:
        payment.payment_status === "paid"
          ? "Pago completado. El stock fue actualizado."
          : "Pago parcial registrado. El stock todavia no fue descontado.",
    };
  } catch (error) {
    if (orderId) {
      revalidateStoreSale(orderId);
    }

    return {
      status: "error",
      orderId: orderId || undefined,
      message:
        error instanceof Error ? error.message : "No se pudo registrar el pago.",
    };
  }
}
