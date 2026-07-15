import { getSupabaseClient } from "@/lib/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { calculatePricing, getUnitPriceForPayment } from "@/lib/pricing";
import type { CartItem } from "@/store/cart-store";

export type PaymentMethod = "transfer" | "mercadopago";
export type ShippingMethod = "pickup" | "shipping";

export type CheckoutCustomer = {
  fullName: string;
  phone: string;
  email: string;
};

export type CheckoutShipping = {
  method: ShippingMethod;
  province?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  carrier?: "Correo Argentino" | "Andreani" | "Via Cargo";
};

export type CreateOrderFromCheckoutPayload = {
  customer: CheckoutCustomer;
  shipping: CheckoutShipping;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  subtotal: number;
  total: number;
  discount?: number;
  shippingCost?: number;
};

export type CreatedOrder = {
  id: string;
  orderNumber: string;
};

export type CheckoutSuccessOrder = {
  id: string;
  order_number: string;
  total: number;
  payment_method: PaymentMethod;
};

function createOrderNumber() {
  return `SF-${Date.now()}`;
}

function createShippingNotes(shipping: CheckoutShipping) {
  if (shipping.method === "pickup") {
    return "Retiro en punto de entrega: Juan de Garay 2090, Cordoba, Argentina.";
  }

  return [
    "Envio solicitado.",
    `Provincia: ${shipping.province ?? ""}`,
    `Ciudad: ${shipping.city ?? ""}`,
    `Direccion: ${shipping.address ?? ""}`,
    `Codigo postal: ${shipping.postalCode ?? ""}`,
    `Transporte preferido: ${shipping.carrier ?? ""}`,
  ].join("\n");
}

export async function createOrderFromCheckout(
  payload: CreateOrderFromCheckoutPayload,
): Promise<CreatedOrder> {
  if (payload.items.length === 0) {
    throw new Error("El carrito esta vacio.");
  }

  const supabase = getSupabaseClient();
  const customerId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const orderNumber = createOrderNumber();
  const pricing = calculatePricing(payload.items, payload.paymentMethod);

  const { error: customerError } = await supabase
    .from("customers")
    .insert({
      id: customerId,
      full_name: payload.customer.fullName,
      phone: payload.customer.phone,
      email: payload.customer.email,
      province:
        payload.shipping.method === "shipping"
          ? payload.shipping.province
          : null,
      city:
        payload.shipping.method === "shipping" ? payload.shipping.city : null,
      address:
        payload.shipping.method === "shipping"
          ? payload.shipping.address
          : null,
      postal_code:
        payload.shipping.method === "shipping"
          ? payload.shipping.postalCode
          : null,
    });

  if (customerError) {
    throw new Error(customerError?.message ?? "No se pudo crear el cliente.");
  }

  const { error: orderError } = await supabase
    .from("orders")
    .insert({
      id: orderId,
      customer_id: customerId,
      order_number: orderNumber,
      status: "pending",
      payment_status: "pending",
      payment_method: payload.paymentMethod,
      shipping_method: payload.shipping.method,
      shipping_carrier:
        payload.shipping.method === "shipping" ? payload.shipping.carrier : null,
      shipping_province:
        payload.shipping.method === "shipping"
          ? payload.shipping.province
          : null,
      shipping_city:
        payload.shipping.method === "shipping" ? payload.shipping.city : null,
      shipping_address:
        payload.shipping.method === "shipping"
          ? payload.shipping.address
          : null,
      shipping_postal_code:
        payload.shipping.method === "shipping"
          ? payload.shipping.postalCode
          : null,
      subtotal: pricing.subtotal,
      discount: payload.discount ?? pricing.discount,
      shipping_cost: payload.shippingCost ?? 0,
      total: pricing.total + (payload.shippingCost ?? 0),
      notes: createShippingNotes(payload.shipping),
      metadata: {
        source: "sfstore_checkout",
      },
    });

  if (orderError) {
    throw new Error(orderError?.message ?? "No se pudo crear la orden.");
  }

  const orderItems = payload.items.map((item) => {
    const unitPrice = getUnitPriceForPayment(item, payload.paymentMethod);

    return {
      id: crypto.randomUUID(),
      order_id: orderId,
      product_id: null,
      product_name: item.name,
      product_slug: item.slug,
      category_name: item.category,
      unit_price: unitPrice,
      quantity: item.quantity,
      subtotal: unitPrice * item.quantity,
    };
  });

  const { error: orderItemsError } = await supabase
    .from("order_items")
    .insert(orderItems);

  if (orderItemsError) {
    throw new Error(
      orderItemsError.message ?? "No se pudieron crear los items de la orden.",
    );
  }

  return {
    id: orderId,
    orderNumber,
  };
}

export async function getCheckoutSuccessOrder(orderId: string) {
  if (!orderId) {
    return null;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, total, payment_method")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      return null;
    }

    return (data as CheckoutSuccessOrder | null) ?? null;
  } catch {
    return null;
  }
}
