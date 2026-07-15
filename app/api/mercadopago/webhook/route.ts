import { MercadoPagoConfig, Payment } from "mercadopago";
import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { decreaseStockForOrder } from "@/services/inventory";

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
  metadata: Record<string, unknown> | null;
};

type PaymentStatusUpdate = {
  paymentStatus: "pending" | "approved" | "rejected" | "refunded";
  orderStatus?: "paid";
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
        paymentStatus: "approved",
        orderStatus: "paid",
      };
    case "rejected":
    case "cancelled":
      return {
        paymentStatus: "rejected",
      };
    case "refunded":
    case "charged_back":
      return {
        paymentStatus: "refunded",
      };
    case "pending":
    case "in_process":
    default:
      return {
        paymentStatus: "pending",
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
      .select("id, status, payment_status, metadata")
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
    const nextMetadata = {
      ...previousMetadata,
      mercado_pago_payment_id: payment.id ?? paymentId,
      mercado_pago_status: payment.status ?? null,
      mercado_pago_amount: payment.transaction_amount ?? null,
      mercado_pago_date_approved: payment.date_approved ?? null,
      mercado_pago_last_webhook_at: new Date().toISOString(),
    };

    const updatePayload: Record<string, unknown> = {
      payment_status: statusUpdate.paymentStatus,
      metadata: nextMetadata,
    };

    if (statusUpdate.orderStatus) {
      updatePayload.status = statusUpdate.orderStatus;
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
      statusUpdate.paymentStatus === "approved"
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
      payment_status: statusUpdate.paymentStatus,
      order_status: statusUpdate.orderStatus ?? order.status,
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
