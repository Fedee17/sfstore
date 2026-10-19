"use client";

import { Suspense, useState, useRef, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getWebTransferSubtotal } from "@/lib/web-transfer-pricing";
import { TransferAlias } from "@/components/transfer-alias";

import { ensureGuestCheckoutSession } from "@/lib/checkout/guest-client";
import { ARGENTINA_PROVINCES, type ShippingQuote } from "@/lib/checkout/argentina";
import { CheckoutCaptcha } from "@/components/checkout-captcha";
import { createOrderFromCheckout, getCheckoutOperationKey } from "@/services/orders";
import { useCartStore } from "@/store/cart-store";


type DeliveryMethod = "pickup" | "shipping";
type Carrier = "Correo Argentino" | "Andreani" | "Via Cargo" | "";

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
  maximumFractionDigits: 2,
});

const categoryLabels = {
  perfumes: "Perfumes",
  mates: "Mates",
} as const;

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPayment = searchParams.get("payment");
  const unsupportedPayment = !!requestedPayment && requestedPayment !== "transfer";
  const paymentMethod = "transfer";

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
    carrier: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutForm, string>>>(
    {},
  );
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote|null>(null);
  const [selectedQuoteKey, setSelectedQuoteKey] = useState("");
  const [approvedTotal,setApprovedTotal] = useState<number|null>(null);
  const [quotationId, setQuotationId] = useState<string|null>(null);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (submitError) feedbackRef.current?.focus();
  }, [submitError]);

  const checkoutLabel = "Preparar pedido por transferencia";
  const paymentLabel = "Transferencia bancaria";
  const shippingRequired = form.deliveryMethod === "shipping";


  const updateField = <Field extends keyof CheckoutForm>(
    field: Field,
    value: CheckoutForm[Field],
  ) => {
    if (submissionLock.current) return;
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
    setErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
    setSubmitError("");
    if (["province","city","postalCode","deliveryMethod","address","carrier","fullName","phone","email"].includes(field)) { setShippingQuote(null); setSelectedQuoteKey(""); }
    setQuotationId(null); setApprovedTotal(null);
  };

  const validateForm = () => {
    const nextErrors: Partial<Record<keyof CheckoutForm, string>> = {};

    if (!form.fullName.trim()) {
      nextErrors.fullName = "Ingresá tu nombre completo.";
    }

    if (!form.phone.trim()) {
      nextErrors.phone = "Ingresá un teléfono de contacto.";
    }

    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email)) {
      nextErrors.email = "Ingresá un email válido.";
    }

    if (shippingRequired) {
      if (!form.carrier) nextErrors.carrier="Elegí el transporte preferido.";
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
    if (Object.keys(nextErrors).length) {
      setSubmitError("Revisá los datos indicados antes de preparar el pedido.");
    }
    return Object.keys(nextErrors).length === 0;
  };

  const submissionLock = useRef(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (unsupportedPayment || submissionLock.current || !validateForm()) {
      return;
    }

    if (shippingRequired && !selectedQuoteKey) { setSubmitError("Calculá el envío y elegí una tarifa válida, o solicitá una cotización antes de preparar el pedido."); return; }
    submissionLock.current = true;
    setIsSubmitting(true);
    setSubmitError("");

    try {
      await ensureGuestCheckoutSession(captchaToken);
      const createdOrder = await createOrderFromCheckout({
        customer: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
        },
        shipping: {
          method: form.deliveryMethod,
          province: shippingRequired ? form.province.trim() : undefined,
          city: shippingRequired ? form.city.trim() : undefined,
          address: shippingRequired ? form.address.trim() : undefined,
          postalCode: shippingRequired ? form.postalCode.trim() : undefined,
          carrier: shippingRequired ? shippingQuote?.rates.find(rate=>rate.quoteKey===selectedQuoteKey)?.carrier : undefined,
          quoteKey: shippingRequired ? selectedQuoteKey : undefined,
        },
        paymentMethod,
        items,
      });

      clearCart();
      router.push(
        `/checkout/exito?order=${createdOrder.id}`,
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el pedido. Intentalo nuevamente.",
      );
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const calculateShipping = async () => {
    if (submissionLock.current) return;
    submissionLock.current = true; setIsSubmitting(true); setSubmitError(""); setShippingQuote(null); setSelectedQuoteKey(""); setApprovedTotal(null);
    try {
      await ensureGuestCheckoutSession(captchaToken);
      const response = await fetch("/api/checkout/shipping",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ province:form.province,city:form.city.trim(),postalCode:form.postalCode.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error??"No se pudo calcular el envío.");
      setShippingQuote({...result,rates:result.rates.filter((rate:{carrier:string})=>rate.carrier===form.carrier),status:result.rates.some((rate:{carrier:string})=>rate.carrier===form.carrier)?"available":"quotation_required"});
    } catch (error) { setSubmitError(error instanceof Error ? error.message : "No se pudo calcular el envío."); }
    finally { submissionLock.current = false; setIsSubmitting(false); }
  };
  const requestQuotation = async () => {
    if (submissionLock.current || !validateForm()) return;
    submissionLock.current = true; setIsSubmitting(true); setSubmitError("");
    try {
      await ensureGuestCheckoutSession(captchaToken);
      const request = { customer:{fullName:form.fullName.trim(),phone:form.phone.trim(),email:form.email.trim()||undefined},shipping:{method:"shipping",carrier:form.carrier,province:form.province,city:form.city.trim(),postalCode:form.postalCode.trim(),address:form.address.trim()},paymentMethod:"transfer",items:items.map(item=>({productId:item.productId,quantity:item.quantity})).sort((a,b)=>a.productId.localeCompare(b.productId)) };
      const operationKey = await getCheckoutOperationKey(request,"sfstore-shipping-quotation-operation");
      const response = await fetch("/api/checkout/quotation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...request,operationKey})});
      const result = await response.json();if (!response.ok) throw new Error(result.error??"No se pudo solicitar la cotización.");
      setQuotationId(result.id);
    } catch (error) { setSubmitError(error instanceof Error ? error.message : "No se pudo solicitar la cotización."); }
    finally { submissionLock.current = false;setIsSubmitting(false); }
  };

  const refreshQuotation = async () => {
    if (!quotationId || submissionLock.current) return;
    submissionLock.current=true;setIsSubmitting(true);setSubmitError("");
    try {
      const response=await fetch("/api/checkout/quotation?id="+encodeURIComponent(quotationId),{cache:"no-store"});const data=await response.json();
      if(!response.ok)throw new Error("No se pudo consultar la cotización. Conservá esta sesión.");
      if(data.status==="resolved"&&!data.accepted_order_id&&Date.parse(data.valid_until)<=Date.now()){
        setQuotationId(null);setApprovedTotal(null);setSelectedQuoteKey("");setShippingQuote({country:"AR",status:"quotation_required",rates:[]});sessionStorage.removeItem("sfstore-shipping-quotation-operation");setSubmitError("La cotización venció. Solicitá una nueva; no transfieras.");return;
      }
      if(data.status!=="resolved"||data.accepted_order_id||!data.quote_key){setSubmitError("La cotización todavía no está disponible para aceptar. Consultá al local; no transfieras.");return;}
      setShippingQuote({country:"AR",status:"available",rates:[{carrier:data.quoted_carrier,fee:Number(data.shipping_fee),quoteKey:data.quote_key}]});setSelectedQuoteKey(data.quote_key);setApprovedTotal(Number(data.quoted_total));
    }catch(error){setSubmitError(error instanceof Error?error.message:"No se pudo consultar la cotización.");}finally{submissionLock.current=false;setIsSubmitting(false);}
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
            Completá tus datos para preparar el pedido. La disponibilidad y el importe
            se verifican al preparar el pedido. El pago se confirma manualmente.
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
            onInvalid={(event) => {
              event.preventDefault();
              setSubmitError("Revisá los datos indicados antes de preparar el pedido.");
            }}
            className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]"
          >
            <div className="space-y-6">
              <section className="rounded-[2rem] border border-[#003B73]/15 bg-white/70 p-6 shadow-sm">
                <h2 className="text-2xl font-semibold">Datos para procesar el pedido</h2>
                <p className="mt-2">Comprá sin registro ni contraseña. Conservá esta sesión para consultar tu pedido.</p>
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
                        Email (opcional)
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
                      Retiro en el local · Sin costo
                    </span>
                    <p className="mt-2 text-sm leading-6 text-[#102033]/65">
                      Pagás por transferencia. Esperá la confirmación del local antes de retirar; coordinaremos los detalles.
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
                        <select aria-label="Provincia" value={form.province} onChange={event=>updateField("province",event.target.value)} className="rounded-2xl border border-[#003B73]/20 bg-[#F7F9FC] px-4 py-3">
                          <option value="">Seleccioná una provincia</option>
                          {ARGENTINA_PROVINCES.map(province=><option key={province} value={province}>{province}</option>)}
                        </select>
                        {errors.province ? (
                          <span className="text-xs font-semibold text-[#003B73]">
                            {errors.province}
                          </span>
                        ) : null}
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#102033]/75">
                          Localidad
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

                    <label className="grid gap-2">Transporte preferido<select aria-label="Transporte preferido" value={form.carrier} onChange={event=>updateField("carrier",event.target.value as Carrier)} className="rounded-xl border p-3"><option value="">Elegí un transporte</option>{["Correo Argentino","Andreani","Via Cargo"].map(carrier=><option key={carrier}>{carrier}</option>)}</select>{errors.carrier?<span>{errors.carrier}</span>:null}</label><p>El costo depende del destino y de una tarifa aprobada por el local. Este formulario no contrata transporte.</p>
                    <button type="button" disabled={isSubmitting} onClick={calculateShipping} className="rounded-xl border p-3">Calcular envío</button>
                    {shippingQuote?.status === "available" ? <label className="grid gap-2">Tarifa disponible
                      <select aria-label="Tarifa disponible" value={selectedQuoteKey} onChange={event=>setSelectedQuoteKey(event.target.value)} className="rounded-xl border p-3">
                        <option value="">Elegí una tarifa</option>
                        {shippingQuote.rates.filter(rate=>rate.carrier===form.carrier).map(rate=><option key={rate.quoteKey} value={rate.quoteKey}>{rate.carrier} · {currencyFormatter.format(rate.fee)}</option>)}
                      </select>
                    </label> : null}
                    {shippingQuote?.status === "quotation_required" ? <div><p>No hay tarifa aprobada para este destino y transporte. Solicitá una cotización: no se confirma un pedido ni se reserva stock hasta aceptar el total definitivo. No transfieras antes de conocerlo.</p>
                      <button type="button" disabled={isSubmitting || !!quotationId} onClick={requestQuotation} className="mt-3 rounded-xl border p-3">Solicitar cotización</button>
                    </div> : null}
                    {approvedTotal !== null ? <p role="status">Cotización aprobada: el total incluye los productos con 25% de descuento y el envío. Al aceptar se verificará nuevamente la disponibilidad y el precio. No transfieras hasta obtener el pedido con su total final.</p> : null}
                    {quotationId ? <div><button type="button" disabled={isSubmitting} onClick={refreshQuotation} className="rounded border p-3">Consultar cotización del local</button><p role="status">Solicitud registrada: {quotationId}. El local revisará el transporte elegido y comunicará el costo. No es un pedido confirmado ni una reserva. No transfieras todavía.</p></div> : null}

                  </div>
                ) : null}
              </section>

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
                  {shippingRequired && !selectedQuoteKey ? <p className="mt-4">Primero conocé y aceptá el total definitivo, incluido el envío. No transfieras ni informes un pago mientras falta la cotización.</p> : <><ol className="mt-5 grid gap-3 text-sm leading-6"><li>1. Preparás el pedido con el total final.</li><li>2. Transferís el 100% del importe exacto a Naranja X.</li><li>3. Informás el pago y adjuntás el comprobante en la pantalla del pedido.</li><li>4. El local verifica la acreditación antes de confirmar la venta.</li></ol><div className="mt-5"><TransferAlias /></div></>}
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
                          item.price *
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
                  <span className="text-[#102033]/65">Subtotal de referencia (lista)</span>
                  <span className="font-semibold">
                    {currencyFormatter.format(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between"><span>Productos con 25% de descuento (referencia)</span><span>{currencyFormatter.format(getWebTransferSubtotal(items))}</span></div><p>25% de descuento en productos por transferencia. El servidor calcula el importe final y lo congela al crear el pedido; envío según configuración válida.</p>
                <div className="flex justify-between border-t border-[#003B73]/15 pt-3 text-base">
                  <span className="font-semibold">Total final</span>
                  <span className="font-semibold text-[#003B73]">
                    {shippingRequired && !selectedQuoteKey ? "Pendiente de cotización; no transfieras" : approvedTotal !== null ? currencyFormatter.format(approvedTotal) : "Se confirma al crear el pedido"}
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
                  Primero aceptás el total definitivo al preparar el pedido; el precio queda fijo entonces. Tenés 24 horas para transferir el 100% del total e informar el pago con comprobante. No se admiten señas ni pagos parciales.
                </div>
              ) : null}

              <label className="mt-5 grid gap-2 text-sm font-semibold">
                Método de pago
                <select value={paymentMethod} disabled className="rounded-xl border p-3"><option value="transfer">Transferencia bancaria</option></select>
              </label>
              {unsupportedPayment ? <p role="alert" className="mt-3">El método solicitado no está habilitado. Volvé al carrito para elegir un pago manual.</p> : null}
              <CheckoutCaptcha onToken={setCaptchaToken} />
              {submitError ? (
                <div
                  id="checkout-feedback"
                  ref={feedbackRef}
                  role="alert"
                  tabIndex={-1}
                  className="mt-4 rounded-2xl border border-[#003B73]/25 bg-[#EEF2F6] p-4 text-sm font-semibold text-[#003B73]"
                >
                  {submitError}
                </div>
              ) : null}
              <button
                type="submit"
                aria-describedby={submitError ? "checkout-feedback" : undefined}
                disabled={isSubmitting || unsupportedPayment || (shippingRequired && !selectedQuoteKey)}
                className="mt-6 flex w-full items-center justify-center rounded-full bg-[#102033] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0072CE] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Creando pedido..." : approvedTotal !== null ? "Aceptar total y preparar pedido por transferencia" : checkoutLabel}
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


