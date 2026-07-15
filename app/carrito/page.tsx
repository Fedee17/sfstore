"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { transferPayment } from "@/lib/payment";
import {
  calculatePricing,
  formatSavingsLabel,
  getTransferUnitPrice,
  getUnitPriceForPayment,
  hasTransferPrice,
} from "@/lib/pricing";
import { buildCartWhatsAppUrl } from "@/lib/whatsapp";
import { useCartStore } from "@/store/cart-store";

type PaymentMethod = "transfer" | "mercadopago";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const categoryLabels = {
  perfumes: "Perfumes",
  mates: "Mates",
} as const;

export default function CartPage() {
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>("transfer");
  const {
    items,
    totalItems,
    subtotal,
    removeItem,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
  } = useCartStore();

  const pricing = calculatePricing(items, selectedPaymentMethod);
  const checkoutHref = `/checkout?payment=${selectedPaymentMethod}`;
  const whatsappHref = buildCartWhatsAppUrl(items, selectedPaymentMethod, {
    total: pricing.total,
  });
  const checkoutLabel =
    selectedPaymentMethod === "transfer"
      ? "Continuar con transferencia"
      : "Continuar con Mercado Pago";

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
        <div className="flex min-w-0 flex-col justify-between gap-6 border-b border-[#003B73]/20 pb-8 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              Carrito
            </p>
            <h1 className="mt-3 break-words text-4xl font-semibold leading-tight sm:text-5xl">
              Tu selección SFSTORE
            </h1>
          </div>
          <p className="max-w-xl text-base leading-7 text-[#102033]/70 md:text-right">
            Revisá cantidades, elegí método de pago y avanzá al checkout.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="mt-12 rounded-[2rem] border border-[#003B73]/15 bg-white/65 p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">
              Tu carrito está vacío, pero la vidriera está lista.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#102033]/65">
              Explorá perfumes para regalar bien o mates para armar tu ritual.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="/perfumes"
                className="rounded-full bg-[#0072CE] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#003B73]"
              >
                Ver perfumes
              </a>
              <a
                href="/mates"
                className="rounded-full border border-[#0072CE]/35 px-6 py-3 text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:bg-[#F7F9FC]"
              >
                Ver mates
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              {items.map((item) => {
                const transferUnitPrice = getTransferUnitPrice(item);
                const selectedUnitPrice = getUnitPriceForPayment(
                  item,
                  selectedPaymentMethod,
                );
                const showTransferPrice = hasTransferPrice(item);
                const savingsLabel =
                  selectedPaymentMethod === "transfer"
                    ? formatSavingsLabel(item.price, item.transferPrice)
                    : null;

                return (
                  <article
                    key={item.productId}
                    className="overflow-hidden rounded-3xl border border-[#003B73]/15 bg-white/70 p-5 shadow-sm"
                  >
                    <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#003B73]">
                        {categoryLabels[item.category]}
                      </p>
                      <a
                        href={`/producto/${item.slug}`}
                        className="mt-2 block break-words text-2xl font-semibold transition hover:text-[#0072CE]"
                      >
                        {item.name}
                      </a>
                      {showTransferPrice ? (
                        <div className="mt-3 min-w-0">
                          <p className="break-words text-sm font-semibold text-[#0072CE]">
                            Precio efectivo/transferencia:{" "}
                            {currencyFormatter.format(transferUnitPrice)}
                          </p>
                          {savingsLabel ? (
                            <span className="mt-1 inline-flex max-w-full rounded-full bg-[#0072CE]/10 px-2.5 py-1 text-xs font-semibold text-[#0072CE]">
                              {savingsLabel}
                            </span>
                          ) : null}
                          <p className="mt-1 break-words text-xs text-[#102033]/55">
                            Precio lista: {currencyFormatter.format(item.price)}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-[#102033]/60">
                          Precio lista: {currencyFormatter.format(item.price)}
                        </p>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-3 md:justify-end">
                      <div className="flex items-center rounded-full border border-[#003B73]/20 bg-[#F7F9FC]">
                        <button
                          type="button"
                          onClick={() => decreaseQuantity(item.productId)}
                          className="h-10 w-10 text-lg font-semibold text-[#003B73] transition hover:text-[#0072CE]"
                        >
                          -
                        </button>
                        <span className="min-w-10 text-center text-sm font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => increaseQuantity(item.productId)}
                          disabled={item.quantity >= item.stock}
                          className="h-10 w-10 text-lg font-semibold text-[#003B73] transition hover:text-[#0072CE] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          +
                        </button>
                      </div>
                      <p className="min-w-0 break-words text-right text-lg font-semibold text-[#003B73]">
                        {currencyFormatter.format(
                          selectedUnitPrice * item.quantity,
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        className="rounded-full border border-[#102033]/10 px-4 py-2 text-sm font-semibold text-[#102033]/70 transition hover:border-[#0072CE] hover:text-[#003B73]"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}

              <button
                type="button"
                onClick={clearCart}
                className="text-sm font-semibold text-[#003B73] transition hover:text-[#0072CE]"
              >
                Vaciar carrito
              </button>
            </div>

            <aside className="h-fit rounded-[2rem] border border-[#003B73]/15 bg-white/75 p-6 shadow-sm">
              <h2 className="text-2xl font-semibold">Resumen de compra</h2>
              <div className="mt-6 space-y-3 border-b border-[#003B73]/15 pb-5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#102033]/65">Productos</span>
                  <span className="font-semibold">{totalItems}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#102033]/65">Subtotal lista</span>
                  <span className="font-semibold">
                    {currencyFormatter.format(subtotal)}
                  </span>
                </div>
                {pricing.discount > 0 ? (
                  <div className="flex justify-between text-[#0072CE]">
                    <span>Precio efectivo/transferencia</span>
                    <span className="font-semibold">
                      -{currencyFormatter.format(pricing.discount)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-[#003B73]/15 pt-3 text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold text-[#003B73]">
                    {currencyFormatter.format(pricing.total)}
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#003B73]">
                  Método de pago
                </p>
                <p className="mt-2 text-sm leading-6 text-[#102033]/65">
                  {selectedPaymentMethod === "transfer"
                    ? "Estás viendo precio efectivo/transferencia."
                    : "Mercado Pago usa precio lista."}
                </p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod("transfer")}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selectedPaymentMethod === "transfer"
                        ? "border-[#0072CE] bg-[#0072CE]/10"
                        : "border-[#003B73]/15 bg-[#F7F9FC]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[#0072CE]">
                        Transferencia bancaria
                      </span>
                      <span className="rounded-full bg-[#0072CE] px-3 py-1 text-xs font-semibold text-white">
                        Recomendado
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#102033]/65">
                      Pagando por efectivo o transferencia accedés al precio especial disponible.
                    </p>
                    <p className="mt-2 text-xs font-semibold text-[#102033]/55">
                      Alias: {transferPayment.alias}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod("mercadopago")}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selectedPaymentMethod === "mercadopago"
                        ? "border-[#003B73] bg-[#EEF2F6]"
                        : "border-[#003B73]/15 bg-[#F7F9FC]"
                    }`}
                  >
                    <span className="text-sm font-semibold text-[#003B73]">
                      Mercado Pago
                    </span>
                    <p className="mt-2 text-sm leading-6 text-[#102033]/65">
                      Pagás el precio lista con el checkout de Mercado Pago.
                    </p>
                  </button>
                </div>
              </div>

              <a
                href={checkoutHref}
                className="mt-6 flex w-full items-center justify-center rounded-full bg-[#102033] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0072CE]"
              >
                {checkoutLabel}
              </a>
              <a
                href="/perfumes"
                className="mt-3 flex w-full items-center justify-center rounded-full border border-[#102033]/10 px-6 py-3.5 text-center text-sm font-semibold text-[#102033]/70 transition hover:border-[#0072CE] hover:text-[#0072CE]"
              >
                Seguir comprando
              </a>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center rounded-full border border-[#0072CE]/35 px-6 py-3.5 text-center text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:bg-[#F7F9FC]"
              >
                Consultar carrito por WhatsApp
              </a>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}


