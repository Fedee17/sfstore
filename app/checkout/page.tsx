"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { transferPayment } from "@/lib/payment";
import { calculatePricing, getUnitPriceForPayment } from "@/lib/pricing";
import { createOrderFromCheckout } from "@/services/orders";
import { useCartStore } from "@/store/cart-store";

type PaymentMethod = "transfer" | "mercadopago";
type DeliveryMethod = "pickup" | "shipping";
type Carrier = "Correo Argentino" | "Andreani" | "Via Cargo";

type CheckoutForm = {
  fullName: string;
  phone: string;
  email: string;
  deliveryMethod: DeliveryMethod;
  province: string;
  city: string;
  address: string;
  postalCode: string;
  carrier: Carrier;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const categoryLabels = {
  perfumes: "Perfumes",
  mates: "Mates",
} as const;

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPayment = searchParams.get("payment");
  const paymentMethod: PaymentMethod =
    requestedPayment === "mercadopago" ? "mercadopago" : "transfer";

  const { items, totalItems, subtotal, clearCart } = useCartStore();
  const [form, setForm] = useState<CheckoutForm>({
    fullName: "",
    phone: "",
    email: "",
    deliveryMethod: "pickup",
    province: "",
    city: "",
    address: "",
    postalCode: "",
    carrier: "Correo Argentino",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutForm, string>>>(
    {},
  );
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkoutLabel =
    paymentMethod === "transfer"
      ? "Preparar pedido por transferencia"
      : "Continuar con Mercado Pago";
  const paymentLabel =
    paymentMethod === "transfer" ? "Transferencia bancaria" : "Mercado Pago";
  const shippingRequired = form.deliveryMethod === "shipping";
  const pricing = calculatePricing(items, paymentMethod);

  const updateField = <Field extends keyof CheckoutForm>(
    field: Field,
    value: CheckoutForm[Field],
  ) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
    setErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
    setSubmitError("");
  };

  const validateForm = () => {
    const nextErrors: Partial<Record<keyof CheckoutForm, string>> = {};

    if (!form.fullName.trim()) {
      nextErrors.fullName = "Ingresá tu nombre completo.";
    }

    if (!form.phone.trim()) {
      nextErrors.phone = "Ingresá un teléfono de contacto.";
    }

    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) {
      nextErrors.email = "Ingresá un email válido.";
    }

    if (shippingRequired) {
      if (!form.province.trim()) {
        nextErrors.province = "Ingresá la provincia.";
      }
      if (!form.city.trim()) {
        nextErrors.city = "Ingresá la ciudad.";
      }
      if (!form.address.trim()) {
        nextErrors.address = "Ingresá la dirección.";
      }
      if (!form.postalCode.trim()) {
        nextErrors.postalCode = "Ingresá el código postal.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const createdOrder = await createOrderFromCheckout({
        customer: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
        },
        shipping: {
          method: form.deliveryMethod,
          province: shippingRequired ? form.province.trim() : undefined,
          city: shippingRequired ? form.city.trim() : undefined,
          address: shippingRequired ? form.address.trim() : undefined,
          postalCode: shippingRequired ? form.postalCode.trim() : undefined,
          carrier: shippingRequired ? form.carrier : undefined,
        },
        paymentMethod,
        items,
        subtotal: pricing.subtotal,
        total: pricing.total,
        discount: pricing.discount,
        shippingCost: 0,
      });

      if (paymentMethod === "mercadopago") {
        const preferenceResponse = await fetch(
          "/api/mercadopago/create-preference",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ orderId: createdOrder.id }),
          },
        );
        const preference = (await preferenceResponse.json()) as {
          initPoint?: string;
          error?: string;
        };

        if (!preferenceResponse.ok || !preference.initPoint) {
          throw new Error(
            preference.error ??
              "No se pudo iniciar el pago con Mercado Pago. El pedido quedó creado.",
          );
        }

        clearCart();
        window.location.href = preference.initPoint;
        return;
      }

      clearCart();
      router.push(
        `/checkout/exito?order=${createdOrder.id}&number=${createdOrder.orderNumber}&total=${pricing.total}`,
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el pedido. Intentalo nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
        <a
          href="/carrito"
          className="text-sm font-semibold text-[#003B73] transition hover:text-[#0072CE]"
        >
          Volver al carrito
        </a>

        <div className="mt-10 flex flex-col justify-between gap-6 border-b border-[#003B73]/20 pb-8 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
              Checkout
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
              Prepará tu pedido
            </h1>
          </div>
          <p className="max-w-xl text-base leading-7 text-[#102033]/70">
            Completá tus datos para reservar la compra. Si elegís Mercado Pago,
            te redirigimos al checkout seguro para pagar.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="mt-12 rounded-[2rem] border border-[#003B73]/15 bg-white/65 p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">
              No hay productos para finalizar
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#102033]/65">
              Sumá productos al carrito antes de preparar el pedido.
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
          <form
            onSubmit={handleSubmit}
            className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]"
          >
            <div className="space-y-6">
              <section className="rounded-[2rem] border border-[#003B73]/15 bg-white/70 p-6 shadow-sm">
                <h2 className="text-2xl font-semibold">Datos del cliente</h2>
                <div className="mt-6 grid gap-5">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#102033]/75">
                      Nombre completo
                    </span>
                    <input
                      value={form.fullName}
                      onChange={(event) =>
                        updateField("fullName", event.target.value)
                      }
                      className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3 outline-none transition focus:border-[#0072CE]"
                      placeholder="Tu nombre y apellido"
                    />
                    {errors.fullName ? (
                      <span className="text-xs font-semibold text-[#003B73]">
                        {errors.fullName}
                      </span>
                    ) : null}
                  </label>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#102033]/75">
                        Teléfono
                      </span>
                      <input
                        value={form.phone}
                        onChange={(event) =>
                          updateField("phone", event.target.value)
                        }
                        className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3 outline-none transition focus:border-[#0072CE]"
                        placeholder="3564..."
                      />
                      {errors.phone ? (
                        <span className="text-xs font-semibold text-[#003B73]">
                          {errors.phone}
                        </span>
                      ) : null}
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#102033]/75">
                        Email
                      </span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          updateField("email", event.target.value)
                        }
                        className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3 outline-none transition focus:border-[#0072CE]"
                        placeholder="tu@email.com"
                      />
                      {errors.email ? (
                        <span className="text-xs font-semibold text-[#003B73]">
                          {errors.email}
                        </span>
                      ) : null}
                    </label>
                  </div>
                </div>
              </section>

              <section className="rounded-[2rem] border border-[#003B73]/15 bg-white/70 p-6 shadow-sm">
                <h2 className="text-2xl font-semibold">Tipo de entrega</h2>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateField("deliveryMethod", "pickup")}
                    className={`rounded-2xl border p-4 text-left transition ${
                      form.deliveryMethod === "pickup"
                        ? "border-[#0072CE] bg-[#0072CE]/10"
                        : "border-[#003B73]/15 bg-[#F7F9FC]"
                    }`}
                  >
                    <span className="text-sm font-semibold text-[#0072CE]">
                      Retiro en punto de entrega
                    </span>
                    <p className="mt-2 text-sm leading-6 text-[#102033]/65">
                      Coordinamos el retiro en Juan de Garay 2090.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateField("deliveryMethod", "shipping")}
                    className={`rounded-2xl border p-4 text-left transition ${
                      form.deliveryMethod === "shipping"
                        ? "border-[#003B73] bg-[#EEF2F6]"
                        : "border-[#003B73]/15 bg-[#F7F9FC]"
                    }`}
                  >
                    <span className="text-sm font-semibold text-[#003B73]">
                      Envío
                    </span>
                    <p className="mt-2 text-sm leading-6 text-[#102033]/65">
                      Dejá los datos para calcular y coordinar el despacho.
                    </p>
                  </button>
                </div>

                {shippingRequired ? (
                  <div className="mt-6 grid gap-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#102033]/75">
                          Provincia
                        </span>
                        <input
                          value={form.province}
                          onChange={(event) =>
                            updateField("province", event.target.value)
                          }
                          className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3 outline-none transition focus:border-[#0072CE]"
                        />
                        {errors.province ? (
                          <span className="text-xs font-semibold text-[#003B73]">
                            {errors.province}
                          </span>
                        ) : null}
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#102033]/75">
                          Ciudad
                        </span>
                        <input
                          value={form.city}
                          onChange={(event) =>
                            updateField("city", event.target.value)
                          }
                          className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3 outline-none transition focus:border-[#0072CE]"
                        />
                        {errors.city ? (
                          <span className="text-xs font-semibold text-[#003B73]">
                            {errors.city}
                          </span>
                        ) : null}
                      </label>
                    </div>

                    <div className="grid gap-5 md:grid-cols-[1fr_180px]">
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#102033]/75">
                          Dirección
                        </span>
                        <input
                          value={form.address}
                          onChange={(event) =>
                            updateField("address", event.target.value)
                          }
                          className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3 outline-none transition focus:border-[#0072CE]"
                        />
                        {errors.address ? (
                          <span className="text-xs font-semibold text-[#003B73]">
                            {errors.address}
                          </span>
                        ) : null}
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#102033]/75">
                          Código postal
                        </span>
                        <input
                          value={form.postalCode}
                          onChange={(event) =>
                            updateField("postalCode", event.target.value)
                          }
                          className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3 outline-none transition focus:border-[#0072CE]"
                        />
                        {errors.postalCode ? (
                          <span className="text-xs font-semibold text-[#003B73]">
                            {errors.postalCode}
                          </span>
                        ) : null}
                      </label>
                    </div>

                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#102033]/75">
                        Transporte preferido
                      </span>
                      <select
                        value={form.carrier}
                        onChange={(event) =>
                          updateField("carrier", event.target.value as Carrier)
                        }
                        className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3 outline-none transition focus:border-[#0072CE]"
                      >
                        <option>Correo Argentino</option>
                        <option>Andreani</option>
                        <option>Via Cargo</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </section>

              {submitError ? (
                <div className="rounded-3xl border border-[#003B73]/25 bg-[#EEF2F6] p-5 text-sm font-semibold text-[#003B73]">
                  {submitError}
                </div>
              ) : null}

              {paymentMethod === "transfer" ? (
                <section className="rounded-[2rem] border border-[#0072CE]/20 bg-[#0072CE]/10 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold text-[#102033]">
                      Cómo pagar por transferencia
                    </h2>
                    <span className="rounded-full bg-[#0072CE] px-3 py-1 text-xs font-semibold text-white">
                      Recomendado
                    </span>
                  </div>
                  <ol className="mt-5 grid gap-3 text-sm leading-6 text-[#102033]/75">
                    <li>1. Confirmás tu pedido desde este checkout.</li>
                    <li>2. Transferís al alias {transferPayment.alias}.</li>
                    <li>3. Enviás el comprobante por WhatsApp.</li>
                    <li>4. Preparamos tu compra.</li>
                  </ol>
                  <div className="mt-5 rounded-2xl border border-[#0072CE]/20 bg-[#F7F9FC] p-4 text-sm">
                    <p>
                      <span className="font-semibold">Titular:</span>{" "}
                      {transferPayment.holder}
                    </p>
                    <p>
                      <span className="font-semibold">Banco/billetera:</span>{" "}
                      {transferPayment.provider}
                    </p>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="h-fit rounded-[2rem] border border-[#003B73]/15 bg-white/75 p-6 shadow-sm">
              <h2 className="text-2xl font-semibold">Resumen</h2>
              <div className="mt-6 space-y-4">
                {items.map((item) => (
                  <div
                    key={item.productId}
                    className="border-b border-[#003B73]/15 pb-4 last:border-b-0"
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#003B73]">
                          {categoryLabels[item.category]} x {item.quantity}
                        </p>
                      </div>
                      <p className="font-semibold text-[#003B73]">
                        {currencyFormatter.format(
                          getUnitPriceForPayment(item, paymentMethod) *
                            item.quantity,
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3 border-t border-[#003B73]/15 pt-5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#102033]/65">Productos</span>
                  <span className="font-semibold">{totalItems}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#102033]/65">Subtotal lista</span>
                  <span className="font-semibold">
                    {currencyFormatter.format(pricing.subtotal)}
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
                <div className="flex justify-between">
                  <span className="text-[#102033]/65">Pago</span>
                  <span className="font-semibold">{paymentLabel}</span>
                </div>
              </div>

              {paymentMethod === "transfer" ? (
                <div className="mt-5 rounded-2xl border border-[#0072CE]/25 bg-[#0072CE]/10 p-4 text-sm leading-6 text-[#102033]/75">
                  <span className="font-semibold text-[#0072CE]">
                    Recomendado:
                  </span>{" "}
                  pagando por transferencia o efectivo accedés al mejor precio.
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-[#003B73]/20 bg-[#EEF2F6] p-4 text-sm leading-6 text-[#102033]/75">
                  Mercado Pago usa precio lista. Te redirigimos para completar
                  el pago de forma segura.
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-6 flex w-full items-center justify-center rounded-full bg-[#102033] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0072CE] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Creando pedido..." : checkoutLabel}
              </button>
            </aside>
          </form>
        )}
      </section>
    </main>
  );
}

export default function CheckoutPage() {
  const fallback = (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]" />
  );

  return (
    <Suspense fallback={fallback}>
      <CheckoutContent />
    </Suspense>
  );
}


