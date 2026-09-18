import { MercadoPagoConfig, Payment } from "mercadopago";
import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { decreaseStockForOrder } from "@/services/inventory";
import { addOrderPayment } from "@/services/order-payments";

type MercadoPagoWebhookBody = {
  type?: string;
  topic?: string;
  data?: {
    id?: string | number;
  };
  id?: string | number;
  payment_id?: string | number;
};

type OrderRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  total: number;
  metadata: Record<string, unknown> | null;
};

type PaymentStatusUpdate = {
  entryStatus: "pending" | "approved" | "rejected" | "refunded";
};

function getPaymentId(body: MercadoPagoWebhookBody, searchParams: URLSearchParams) {
  const type = body.type ?? body.topic ?? searchParams.get("type") ?? searchParams.get("topic");

  if (type && type !== "payment") {
    return null;
  }

  return String(
    body.data?.id ??
      body.payment_id ??
      body.id ??
      searchParams.get("payment_id") ??
      searchParams.get("id") ??
      "",
  ).trim();
}

function mapMercadoPagoStatus(status: string | undefined): PaymentStatusUpdate {
  switch (status) {
    case "approved":
      return {
        entryStatus: "approved",
      };
    case "rejected":
    case "cancelled":
      return {
        entryStatus: "rejected",
      };
    case "refunded":
    case "charged_back":
      return {
        entryStatus: "refunded",
      };
    case "pending":
    case "in_process":
    default:
      return {
        entryStatus: "pending",
      };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export function GET() {
  return jsonResponse(
    {
      ok: false,
      error: "Metodo no permitido. Mercado Pago debe llamar este webhook por POST.",
    },
    405,
  );
}

export async function POST(request: Request) {
  // Configurar en Mercado Pago como:
  // `${NEXT_PUBLIC_SITE_URL}/api/mercadopago/webhook`
  // En produccion, NEXT_PUBLIC_SITE_URL debe ser una URL publica HTTPS.
  let body: MercadoPagoWebhookBody = {};

  try {
    body = (await request.json()) as MercadoPagoWebhookBody;
  } catch {
    body = {};
  }

  const url = new URL(request.url);
  const paymentId = getPaymentId(body, url.searchParams);

  if (!paymentId) {
    return jsonResponse({
      ok: true,
      message: "Webhook recibido sin payment_id. No se requiere accion.",
    });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken) {
    return jsonResponse(
      {
        ok: false,
        error: "Falta configurar MERCADO_PAGO_ACCESS_TOKEN.",
      },
      500,
    );
  }

  try {
    const mercadoPago = new MercadoPagoConfig({ accessToken });
    const paymentClient = new Payment(mercadoPago);
    const payment = await paymentClient.get({ id: paymentId });
    const orderId = payment.external_reference?.trim();

    if (!orderId) {
      return jsonResponse({
        ok: true,
        warning: "El pago no tiene external_reference para asociar la orden.",
        mercado_pago_payment_id: payment.id,
      });
    }

    const supabase = getSupabaseAdminClient();
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_status, total, metadata")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      return jsonResponse(
        {
          ok: false,
          error: "No se pudo leer la orden asociada al pago.",
        },
        500,
      );
    }

    const order = orderData as OrderRow | null;

    if (!order) {
      return jsonResponse({
        ok: true,
        warning: "La orden asociada al pago no existe en Supabase.",
        order_id: orderId,
        mercado_pago_payment_id: payment.id,
      });
    }

    const previousMetadata = isRecord(order.metadata) ? order.metadata : {};
    const statusUpdate = mapMercadoPagoStatus(payment.status);
    const paymentAmount = Number(payment.transaction_amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return jsonResponse(
        {
          ok: false,
          error: "Mercado Pago no devolvio un importe valido para la orden.",
        },
        500,
      );
    }

    const paymentResult = await addOrderPayment({
      orderId: order.id,
      method: "mercadopago",
      amount: paymentAmount,
      status: statusUpdate.entryStatus,
      reference: String(payment.id ?? paymentId),
      paidAt: payment.date_approved ?? null,
    });
    const nextMetadata = {
      ...previousMetadata,
      mercado_pago_payment_id: payment.id ?? paymentId,
      mercado_pago_status: payment.status ?? null,
      mercado_pago_amount: payment.transaction_amount ?? null,
      mercado_pago_date_approved: payment.date_approved ?? null,
      mercado_pago_last_webhook_at: new Date().toISOString(),
    };

    const updatePayload: Record<string, unknown> = {
      metadata: nextMetadata,
    };

    if (paymentResult.paymentStatus === "paid") {
      updatePayload.status = "paid";
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id);

    if (updateError) {
      return jsonResponse(
        {
          ok: false,
          error: "No se pudo actualizar la orden con el estado de Mercado Pago.",
        },
        500,
      );
    }

    const stockResult =
      statusUpdate.entryStatus === "approved" &&
      paymentResult.paymentStatus === "paid"
        ? await decreaseStockForOrder(order.id)
        : null;

    if (stockResult && !stockResult.success) {
      console.warn("[mercadopago-webhook] Pago aprobado sin descuento de stock", {
        orderId: order.id,
        mercadoPagoPaymentId: payment.id ?? paymentId,
        error: stockResult.error,
      });
    }

    return jsonResponse({
      ok: true,
      order_id: order.id,
      mercado_pago_payment_id: payment.id ?? paymentId,
      mercado_pago_status: payment.status ?? null,
      payment_status: paymentResult.paymentStatus,
      payment_operation: paymentResult.operation,
      order_status:
        paymentResult.paymentStatus === "paid" ? "paid" : order.status,
      stock_decrease: stockResult,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo procesar el webhook de Mercado Pago.",
      },
      500,
    );
  }
}
