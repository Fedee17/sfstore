import { MercadoPagoConfig, Preference } from "mercadopago";
import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

type CreatePreferenceRequest = {
  orderId?: string;
};

type OrderItemRow = {
  product_name: string | null;
  unit_price: number | string | null;
  quantity: number | null;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  payment_method: string | null;
  order_items?: OrderItemRow[] | null;
};

export async function POST(request: Request) {
  let body: CreatePreferenceRequest;

  try {
    body = (await request.json()) as CreatePreferenceRequest;
  } catch {
    return NextResponse.json(
      { error: "Solicitud invalida para crear la preferencia." },
      { status: 400 },
    );
  }

  const orderId = body.orderId?.trim();

  if (!orderId) {
    return NextResponse.json(
      { error: "Falta el identificador de la orden." },
      { status: 400 },
    );
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Falta configurar MERCADO_PAGO_ACCESS_TOKEN." },
      { status: 500 },
    );
  }

  // Mercado Pago recomienda usar una URL publica para back_urls en produccion.
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
          id,
          order_number,
          payment_method,
          order_items (
            product_name,
            unit_price,
            quantity
          )
        `,
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "No se pudo leer la orden para Mercado Pago." },
        { status: 500 },
      );
    }

    const order = data as OrderRow | null;

    if (!order) {
      return NextResponse.json(
        { error: "La orden indicada no existe." },
        { status: 404 },
      );
    }

    if (order.payment_method !== "mercadopago") {
      return NextResponse.json(
        { error: "La orden no fue creada con Mercado Pago." },
        { status: 400 },
      );
    }

    const items =
      order.order_items
        ?.map((item) => ({
          id: crypto.randomUUID(),
          title: item.product_name ?? "Producto SFSTORE",
          quantity: item.quantity ?? 0,
          unit_price: Number(item.unit_price ?? 0),
          currency_id: "ARS",
        }))
        .filter((item) => item.quantity > 0 && item.unit_price >= 0) ?? [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: "La orden no tiene items validos para pagar." },
        { status: 400 },
      );
    }

    const mercadoPago = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(mercadoPago);
    const response = await preference.create({
      body: {
        items,
        external_reference: order.id,
        back_urls: {
          success: `${siteUrl}/checkout/exito?order=${order.id}`,
          failure: `${siteUrl}/checkout/fallo?order=${order.id}`,
          pending: `${siteUrl}/checkout/pendiente?order=${order.id}`,
        },
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
        },
      },
    });

    return NextResponse.json({
      preferenceId: response.id,
      initPoint: response.init_point ?? response.sandbox_init_point,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la preferencia de Mercado Pago.",
      },
      { status: 500 },
    );
  }
}
