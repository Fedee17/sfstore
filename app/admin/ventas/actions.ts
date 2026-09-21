"use server";

import { revalidatePath } from "next/cache";

import { requireAdminActionSession } from "@/lib/admin-session";
import { parseStoreSaleUnitPrice } from "@/lib/store-sales";
import type { OrderPaymentStatus } from "@/services/order-payments";
import {
  addStoreSalePayment,
  completeStoreSale,
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

  const amount = Number(raw.replace(",", "."));

  if (!Number.isFinite(amount)) {
    throw new Error("El importe del pago no es valido.");
  }

  return amount;
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
    });
    orderId = sale.order_id;

    let paymentStatus: OrderPaymentStatus = "pending";
    const enteredPayments = Math.round(
      payments.reduce((total, payment) => total + payment.amount, 0) * 100,
    ) / 100;

    if (enteredPayments > Number(sale.total)) {
      throw new Error("Los pagos no pueden superar el total de la venta.");
    }

    for (const [index, payment] of payments.entries()) {
      const result = await addStoreSalePayment({
        orderId,
        method: payment.method,
        amount: payment.amount,
        reference: `store:${idempotencyKey}:payment:${index + 1}`,
      });
      paymentStatus = result.paymentStatus;
    }

    if (paymentStatus === "paid") {
      await completeStoreSale(orderId, user.id);
    }

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

    if (!allowedPaymentMethods.has(method)) {
      throw new Error("El medio de pago no es valido.");
    }

    const payment = await addStoreSalePayment({
      orderId,
      method: method as "cash" | "transfer" | "card" | "other",
      amount,
      reference: `store:${orderId}:payment:${paymentKey}`,
    });

    if (payment.paymentStatus === "paid") {
      await completeStoreSale(orderId, user.id);
    }

    revalidateStoreSale(orderId);

    return {
      status: "success",
      orderId,
      paymentStatus: payment.paymentStatus,
      message:
        payment.paymentStatus === "paid"
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
