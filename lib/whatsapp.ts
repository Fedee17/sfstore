import { brand } from "@/lib/brand";
import { getTransferUnitPrice, type PaymentMethod } from "@/lib/pricing";
import type { Product } from "@/types/product";

type CartWhatsAppItem = {
  name: string;
  quantity: number;
  price: number;
  transferPrice?: number | null;
};

type CartWhatsAppTotals = {
  total: number;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return currencyFormatter.format(value);
}

export function buildWhatsAppUrl(message: string) {
  return `https://wa.me/549${brand.whatsapp}?text=${encodeURIComponent(message)}`;
}

export function buildProductWhatsAppMessage(product: Product) {
  const transferPrice = formatCurrency(product.transferPrice);
  const listPrice = formatCurrency(product.price);

  if (product.category === "perfumes") {
    if (transferPrice) {
      return [
        `Hola SFSTORE, quiero consultar por ${product.name}.`,
        `Lo vi en la web y me interesa el precio efectivo/transferencia de ${transferPrice}.`,
        listPrice ? `Precio lista: ${listPrice}.` : null,
        "¿Me ayudás a saber si va con mis gustos o si me conviene probar un decant?",
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      `Hola SFSTORE, quiero consultar por ${product.name}.`,
      listPrice ? `Lo vi en la web con precio lista de ${listPrice}.` : null,
      "¿Me ayudás a elegir si va con mis gustos?",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (product.category === "mates") {
    return [
      `Hola SFSTORE, quiero consultar por ${product.name}.`,
      "Lo vi en la web y me interesa para uso personal o regalo.",
      "¿Me ayudás a combinarlo con termo, yerba o bombilla?",
    ].join("\n");
  }

  return [
    `Hola SFSTORE, quiero consultar por ${product.name}.`,
    "Lo vi en la web y quiero saber disponibilidad, precio y opciones para regalar.",
  ].join("\n");
}

export function buildProductWhatsAppUrl(product: Product) {
  return buildWhatsAppUrl(buildProductWhatsAppMessage(product));
}

export function buildCartWhatsAppMessage(
  cartItems: CartWhatsAppItem[],
  paymentMethod: PaymentMethod,
  totals: CartWhatsAppTotals,
) {
  const paymentLabel =
    paymentMethod === "transfer" ? "efectivo/transferencia" : "Mercado Pago";
  const lines = cartItems.map((item) => {
    const unitPrice =
      paymentMethod === "transfer" ? getTransferUnitPrice(item) : item.price;
    const itemSubtotal = unitPrice * item.quantity;

    return `- ${item.name} x ${item.quantity} - ${currencyFormatter.format(
      itemSubtotal,
    )}`;
  });

  return [
    "Hola SFSTORE, quiero consultar por mi carrito:",
    ...lines,
    `Método elegido: ${paymentLabel}`,
    `Total: ${currencyFormatter.format(totals.total)}`,
    paymentMethod === "transfer"
      ? "Vi que por efectivo/transferencia accedo al precio especial."
      : null,
    "¿Me confirmás disponibilidad y cómo seguimos?",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCartWhatsAppUrl(
  cartItems: CartWhatsAppItem[],
  paymentMethod: PaymentMethod,
  totals: CartWhatsAppTotals,
) {
  return buildWhatsAppUrl(
    buildCartWhatsAppMessage(cartItems, paymentMethod, totals),
  );
}

export const getWhatsAppLink = buildWhatsAppUrl;
export const getProductWhatsAppLink = buildProductWhatsAppUrl;
