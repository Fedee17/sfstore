"use client";
import { publicCategoryLabels as categoryLabels } from "@/lib/catalog/public-product-visibility";
import { brand } from "@/lib/brand";

import { Suspense, useState, useRef, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatWebPrice, getWebRoundingDiscount, getWebTransferSubtotal } from "@/lib/web-transfer-pricing";
import { CartItemIdentity } from "@/components/cart-item-identity";

import { ensureGuestCheckoutSession } from "@/lib/checkout/guest-client";
import { ARGENTINA_PROVINCES, type ShippingQuote } from "@/lib/checkout/argentina";
import { CheckoutCaptcha } from "@/components/checkout-captcha";
import { clearCheckoutOperations, createOrderFromCheckout, getCheckoutOperationKey, quotationOperationStorageKey } from "@/services/orders";
import { useCartStore, useCartHydrated, cartItemKey } from "@/store/cart-store";
import { AnalyticsView } from "@/components/analytics-view";
import { analyticsItem, trackCreatedOrder } from "@/lib/analytics/client";
import { CatalogFrame } from "@/components/catalog/catalog-frame";
import styles from "./checkout.module.css";
import { CheckoutPaymentChoice, checkoutRequestPayment, useMercadoPagoAvailable, type CheckoutPayment } from "@/components/checkout-payment-choice";
import { carriers, clearShippingDraft, deliveryStepHref, parseDeliveryChoice, useShippingDraft, validateShippingAddress, type Carrier, type DeliveryMethod } from "@/lib/checkout/delivery-choice";

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



function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPayment = searchParams.get("payment");
  const unsupportedPayment = !!requestedPayment && requestedPayment !== "transfer";
  // Mercado Pago is offered only when the server enables it; manually quoted shipping stays transfer-only.
  const mercadoPagoAvailable = useMercadoPagoAvailable();
  const [paymentChoice, setPaymentChoice] = useState<CheckoutPayment>("transfer");
  // Chosen in /checkout/entrega; without a valid value the form keeps both options (pickup preselected, as before).
  const chosenDelivery = parseDeliveryChoice(searchParams.get("entrega"));

  const { items, totalItems, subtotal, clearCart } = useCartStore();
  const cartHydrated = useCartHydrated();
  const [formState, setForm] = useState<CheckoutForm>({
    fullName: "",
    phone: "",
    email: "",
    deliveryMethod: chosenDelivery ?? "pickup",
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
  // Shipping calculation and quotation errors are shown next to their buttons, not at the foot of the summary.
  const [shippingError, setShippingError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Address typed in /checkout/entrega (this tab only). Without a complete one the fields stay on screen.
  const shippingDraft = useShippingDraft();
  const stepAddress = chosenDelivery === "shipping" ? shippingDraft : null;
  const addressFromStep = stepAddress !== null;
  const form: CheckoutForm = stepAddress ? { ...formState, ...stepAddress } : formState;
  const feedbackRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (submitError) {
      const invalid=formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      (invalid??feedbackRef.current)?.focus();
    }
  }, [submitError,errors]);

  const shippingRequired = form.deliveryMethod === "shipping";
  const payment: CheckoutPayment = mercadoPagoAvailable && approvedTotal === null ? paymentChoice : "transfer";
  const paymentMethod = payment === "transfer" ? "transfer" : "mercadopago";
  const checkoutLabel = payment === "transfer" ? "Preparar pedido por transferencia" : "Continuar al pago con Mercado Pago";
  const paymentLabel = payment === "transfer" ? "Transferencia bancaria" : payment === "mp-cuotas" ? "Mercado Pago · hasta 3 cuotas" : "Mercado Pago · 1 pago";
  const productsTotal = payment === "mp-cuotas" ? subtotal : getWebTransferSubtotal(items);
  const shippingFee = shippingQuote?.rates.find(rate => rate.quoteKey === selectedQuoteKey)?.fee ?? 0;


  const updateField = <Field extends keyof CheckoutForm>(
    field: Field,
    value: CheckoutForm[Field],
  ) => {
    if (submissionLock.current) return;
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
    setErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
    setSubmitError("");
    setShippingError("");
    // A rate depends only on the destination. Contact data invalidates it only when it came from a manual quotation (requested with that data).
    const destinationChanged = ["province","city","postalCode","deliveryMethod","address","carrier"].includes(field);
    if (destinationChanged || quotationId !== null || approvedTotal !== null) { setShippingQuote(null); setSelectedQuoteKey(""); }
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

    if (shippingRequired) Object.assign(nextErrors, validateShippingAddress(form));

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
        ...checkoutRequestPayment(payment),
        items,
      });

      void trackCreatedOrder(createdOrder.id, createdOrder.total);
      clearCart();
      clearShippingDraft();
      clearCheckoutOperations();
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
    submissionLock.current = true; setIsSubmitting(true); setSubmitError(""); setShippingError(""); setShippingQuote(null); setSelectedQuoteKey(""); setApprovedTotal(null);
    try {
      await ensureGuestCheckoutSession(captchaToken);
      const response = await fetch("/api/checkout/shipping",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ province:form.province,city:form.city.trim(),postalCode:form.postalCode.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error??"No se pudo calcular el envío.");
      const rates = (result.rates as ShippingQuote["rates"]).filter(rate=>rate.carrier===form.carrier);
      setShippingQuote({...result,rates,status:rates.length?"available":"quotation_required"});
      // A single rate for the chosen carrier leaves nothing to choose: preselect it (the buyer still confirms with the final button).
      if (rates.length === 1) setSelectedQuoteKey(rates[0].quoteKey);
    } catch (error) { setShippingError(error instanceof Error ? error.message : "No se pudo calcular el envío."); }
    finally { submissionLock.current = false; setIsSubmitting(false); }
  };
  const requestQuotation = async () => {
    if (submissionLock.current || !validateForm()) return;
    submissionLock.current = true; setIsSubmitting(true); setSubmitError(""); setShippingError("");
    try {
      await ensureGuestCheckoutSession(captchaToken);
      const request = { customer:{fullName:form.fullName.trim(),phone:form.phone.trim(),email:form.email.trim()||undefined},shipping:{method:"shipping",carrier:form.carrier,province:form.province,city:form.city.trim(),postalCode:form.postalCode.trim(),address:form.address.trim()},paymentMethod:"transfer",items:items.map(item=>({productId:item.productId,quantity:item.quantity,...(item.comboConnector?{comboConnector:item.comboConnector}:{})})).sort((a,b)=>a.productId.localeCompare(b.productId)||(a.comboConnector??" ").localeCompare(b.comboConnector??" ")) };
      const operationKey = await getCheckoutOperationKey(request,quotationOperationStorageKey);
      const response = await fetch("/api/checkout/quotation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...request,operationKey})});
      const result = await response.json();if (!response.ok) throw new Error(result.error??"No se pudo solicitar la cotización.");
      setQuotationId(result.id);
    } catch (error) { setShippingError(error instanceof Error ? error.message : "No se pudo solicitar la cotización."); }
    finally { submissionLock.current = false;setIsSubmitting(false); }
  };

  const refreshQuotation = async () => {
    if (!quotationId || submissionLock.current) return;
    submissionLock.current=true;setIsSubmitting(true);setSubmitError("");setShippingError("");
    try {
      const response=await fetch("/api/checkout/quotation?id="+encodeURIComponent(quotationId),{cache:"no-store"});const data=await response.json();
      if(!response.ok)throw new Error("No se pudo consultar la cotización. Conservá esta sesión.");
      if(data.status==="resolved"&&!data.accepted_order_id&&Date.parse(data.valid_until)<=Date.now()){
        setQuotationId(null);setApprovedTotal(null);setSelectedQuoteKey("");setShippingQuote({country:"AR",status:"quotation_required",rates:[]});sessionStorage.removeItem(quotationOperationStorageKey);setShippingError("La cotización venció. Solicitá una nueva; no transfieras.");return;
      }
      if(data.status!=="resolved"||data.accepted_order_id||!data.quote_key){setShippingError("La cotización todavía no está disponible para aceptar. Consultá al local; no transfieras.");return;}
      setShippingQuote({country:"AR",status:"available",rates:[{carrier:data.quoted_carrier,fee:Number(data.shipping_fee),quoteKey:data.quote_key}]});setSelectedQuoteKey(data.quote_key);setApprovedTotal(Number(data.quoted_total));
    }catch(error){setShippingError(error instanceof Error?error.message:"No se pudo consultar la cotización.");}finally{submissionLock.current=false;setIsSubmitting(false);}
  };
  // Text inputs share one markup: label, field, inline error tied by aria-describedby.
  const textField = (name: "fullName" | "phone" | "email" | "city" | "address" | "postalCode", label: string, extra: { type?: string; placeholder?: string; autoComplete?: string; className?: string } = {}) => (
    <div className={`${styles.field} ${extra.className ?? ""}`}>
      <label htmlFor={`checkout-${name}`}>{label}</label>
      <input
        type={extra.type} id={`checkout-${name}`} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `error-${name}` : undefined} value={form[name]}
        autoComplete={extra.autoComplete} placeholder={extra.placeholder}
        onChange={(event) => updateField(name, event.target.value)}
      />
      {errors[name] ? <span id={`error-${name}`} className={styles.error}>{errors[name]}</span> : null}
    </div>
  );
  return (
    <CatalogFrame>
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <section className={styles.checkout} aria-labelledby="checkout-title">
          {items.length > 0 && !unsupportedPayment ? <AnalyticsView event="begin_checkout" identity="checkout" params={{ items: items.map(analyticsItem).filter(Boolean) }} /> : null}
          <a href="/carrito" className={styles.back}><span aria-hidden="true">←&nbsp;</span>Volver al carrito</a>

          <div className={styles.header}>
            <p className={styles.eyebrow}>Finalizar compra</p>
            <h1 id="checkout-title">Prepará tu pedido</h1>
            <p className={styles.lead}>Completá tus datos y elegí cómo recibir tu compra.</p>
          </div>

          {!cartHydrated ? <div className={styles.loading} aria-busy="true"><span className="sr-only">Cargando tu carrito…</span></div> : items.length === 0 ? (
            <div className={`${styles.panel} ${styles.empty}`}>
              <h2>No hay productos para finalizar</h2>
              <p>Sumá productos al carrito antes de preparar el pedido.</p>
              <div>
                <a href="/perfumes" className={styles.primary}>Ver perfumes</a>
                <a href="/mates" className={styles.secondary}>Ver mates</a>
              </div>
            </div>
          ) : (
            <form ref={formRef}
              onSubmit={handleSubmit}
              onInvalid={(event) => {
                event.preventDefault();
                validateForm();
              }}
              className={styles.layout}
            >
              <div className={styles.column}>
                <section className={styles.panel}>
                  <div>
                    <h2>Datos para procesar el pedido</h2>
                    <p className={`${styles.muted} mt-1`}>Comprá sin registro ni contraseña. Conservá esta sesión para consultar tu pedido.</p>
                  </div>
                  <div className={styles.fields}>
                    {textField("fullName", "Nombre completo", { placeholder: "Tu nombre y apellido", autoComplete: "name", className: styles.wide })}
                    {textField("phone", "Teléfono", { type: "tel", placeholder: "3564…", autoComplete: "tel" })}
                    {textField("email", "Email (opcional)", { type: "email", placeholder: "tu@email.com", autoComplete: "email" })}
                  </div>
                </section>

                <section className={styles.panel}>
                  <h2>Tipo de entrega</h2>
                  {chosenDelivery ? (
                    <div className={styles.chosen}>
                      <p>
                        <strong>{chosenDelivery === "pickup" ? "Retiro en el local · Sin cargo" : "Envío a domicilio"}</strong>
                        {chosenDelivery === "pickup" ? <>{brand.address}. {brand.hours}. Esperá la confirmación del local antes de retirar.</> : addressFromStep ? <>{form.address}, {form.city}, {form.province} ({form.postalCode}). Transporte: {form.carrier}.</> : "Completá la dirección para calcular el envío."}
                      </p>
                      <a href={deliveryStepHref} className={styles.back}>Cambiar</a>
                    </div>
                  ) : (
                    <div className={styles.legacyOptions}>
                      <button type="button" className={styles.option} aria-pressed={form.deliveryMethod === "pickup"} data-selected={form.deliveryMethod === "pickup" || undefined} onClick={() => updateField("deliveryMethod", "pickup")}>
                        <span>
                          <strong>Retiro en el local · Sin cargo</strong>
                          <span>Esperá la confirmación del local antes de retirar.</span>
                          <span>{brand.address}. {brand.hours}.</span>
                        </span>
                      </button>
                      <button type="button" className={styles.option} aria-pressed={form.deliveryMethod === "shipping"} data-selected={form.deliveryMethod === "shipping" || undefined} onClick={() => updateField("deliveryMethod", "shipping")}>
                        <span>
                          <strong>Envío a domicilio</strong>
                          <span>Dejá los datos para calcular y coordinar el despacho.</span>
                        </span>
                      </button>
                    </div>
                  )}

                  {shippingRequired ? (
                    <div className="grid gap-4">
                      {addressFromStep ? null : (
                        <div className={styles.fields}>
                          <div className={styles.field}>
                            <label htmlFor="checkout-province">Provincia</label>
                            <select aria-label="Provincia" id="checkout-province" autoComplete="address-level1" aria-invalid={Boolean(errors.province)} aria-describedby={errors.province ? "error-province" : undefined} value={form.province} onChange={event => updateField("province", event.target.value)}>
                              <option value="">Seleccioná una provincia</option>
                              {ARGENTINA_PROVINCES.map(province => <option key={province} value={province}>{province}</option>)}
                            </select>
                            {errors.province ? <span id="error-province" className={styles.error}>{errors.province}</span> : null}
                          </div>
                          {textField("city", "Localidad", { autoComplete: "address-level2" })}
                          {textField("address", "Dirección", { autoComplete: "street-address" })}
                          {textField("postalCode", "Código postal", { autoComplete: "postal-code" })}
                          <div className={`${styles.field} ${styles.wide}`}>
                            <label htmlFor="checkout-carrier">Transporte preferido</label>
                            <select aria-label="Transporte preferido" id="checkout-carrier" aria-invalid={Boolean(errors.carrier)} aria-describedby={errors.carrier ? "error-carrier" : undefined} value={form.carrier} onChange={event => updateField("carrier", event.target.value as Carrier)}>
                              <option value="">Elegí un transporte</option>
                              {carriers.map(carrier => <option key={carrier}>{carrier}</option>)}
                            </select>
                            {errors.carrier ? <span id="error-carrier" className={styles.error}>{errors.carrier}</span> : null}
                          </div>
                        </div>
                      )}
                      <p className={styles.muted}>El costo del envío depende del destino. Lo calculamos con las tarifas del local.</p>
                      <button type="button" disabled={isSubmitting} onClick={calculateShipping} className={styles.secondary}>Calcular envío</button>
                      {shippingError ? <p role="alert" className={styles.alert}>{shippingError}</p> : null}
                      {shippingQuote?.status === "available" ? <label className={styles.field}><span>Tarifa disponible</span>
                        <select aria-label="Tarifa disponible" value={selectedQuoteKey} onChange={event => setSelectedQuoteKey(event.target.value)}>
                          <option value="">Elegí una tarifa</option>
                          {shippingQuote.rates.filter(rate => rate.carrier === form.carrier).map(rate => <option key={rate.quoteKey} value={rate.quoteKey}>{rate.carrier} · {currencyFormatter.format(rate.fee)}</option>)}
                        </select>
                      </label> : null}
                      {shippingQuote?.status === "quotation_required" ? <div className="grid gap-3"><p className={styles.info}>No hay tarifa aprobada para este destino y transporte. Solicitá una cotización: no se confirma un pedido ni se reserva stock hasta aceptar el total definitivo. No transfieras antes de conocerlo.</p>
                        <button type="button" disabled={isSubmitting || !!quotationId} onClick={requestQuotation} className={styles.secondary}>Solicitar cotización</button>
                      </div> : null}
                      {approvedTotal !== null ? <p role="status" className={styles.info}>Cotización aprobada: el total incluye los productos a precio de contado y el envío. Al aceptar se verificará nuevamente la disponibilidad y el precio. No transfieras hasta obtener el pedido con su total final.</p> : null}
                      {quotationId ? <div className="grid gap-3"><button type="button" disabled={isSubmitting} onClick={refreshQuotation} className={styles.secondary}>Consultar cotización del local</button><p role="status" className={styles.info}>Solicitud registrada: {quotationId}. El local revisará el transporte elegido y comunicará el costo. No es un pedido confirmado ni una reserva. No transfieras todavía.</p></div> : null}
                    </div>
                  ) : null}
                </section>

                {mercadoPagoAvailable && approvedTotal === null && !(shippingRequired && !selectedQuoteKey) ? (
                  <CheckoutPaymentChoice value={payment} onChange={setPaymentChoice} cashTotal={getWebTransferSubtotal(items)} listTotal={subtotal} shipping={shippingFee} disabled={isSubmitting} />
                ) : null}

                {paymentMethod === "mercadopago" ? (
                  <section className={styles.panel}>
                    <h2>Cómo sigue tu compra</h2>
                    <ol className={styles.steps}><li>1. Preparás el pedido: verificamos precios y disponibilidad y reservamos el stock.</li><li>2. Pagás en Mercado Pago{payment === "mp-cuotas" ? " con tarjeta de crédito en 2 o 3 cuotas" : " en un pago"}.</li><li>3. El pedido se confirma cuando Mercado Pago acredita el pago.</li></ol>
                  </section>
                ) : null}

                {paymentMethod === "transfer" ? (
                  <section className={styles.panel}>
                    <h2>Cómo sigue tu compra</h2>
                    {shippingRequired && !selectedQuoteKey ? <p className={styles.info}>Primero conocé y aceptá el total definitivo, incluido el envío. No transfieras mientras falta la cotización.</p> : <ol className={styles.steps}><li>1. Preparás el pedido: verificamos precios y disponibilidad.</li><li>2. En la pantalla del pedido ves el importe definitivo y los datos para transferir.</li><li>3. Informás el pago y adjuntás el comprobante allí. El local verifica la acreditación.</li></ol>}
                  </section>
                ) : null}
              </div>

              <aside className={styles.panel} aria-label="Resumen del pedido">
                <div>
                  <h2>Resumen</h2>
                  <p className={`${styles.muted} mt-1`}>{payment === "mp-cuotas" ? "Mercado Pago en cuotas: precio de lista de los productos." : payment === "mp-contado" ? "Mercado Pago en un pago: precio de contado de los productos." : "Transferencia bancaria completa: precio de contado de los productos."}</p>
                </div>
                <div className="grid gap-3.5">
                  {items.map((item) => (
                    <div key={cartItemKey(item)} className={styles.lineItem}>
                      <div className="min-w-0">
                        <CartItemIdentity item={item} />
                        <p className={`${styles.lineMeta} mt-1`}>{categoryLabels[item.category]} · {item.quantity} {item.quantity === 1 ? "unidad" : "unidades"}</p>
                      </div>
                      <p className={styles.linePrice}>{formatWebPrice(payment === "mp-cuotas" ? item.price * item.quantity : getWebTransferSubtotal([item]))}</p>
                    </div>
                  ))}
                </div>

                <div className={styles.rows}>
                  <div><span>Productos</span><span>{totalItems}</span></div>
                  <div><span>Subtotal de lista</span><span>{formatWebPrice(subtotal)}</span></div>
                  {payment === "mp-cuotas" ? null : <div><span>Productos a precio de contado</span><span>{formatWebPrice(getWebTransferSubtotal(items))}</span></div>}
                  {payment !== "mp-cuotas" && getWebRoundingDiscount(items) > 0 ? <div><span>Descuento por redondeo</span><span>−{currencyFormatter.format(getWebRoundingDiscount(items))}</span></div> : null}
                  <div className={styles.totalRow}>
                    <span>{shippingRequired ? "Total con envío" : "Total con retiro en el local"}</span>
                    <span data-pending={(shippingRequired && !selectedQuoteKey) || undefined}>{shippingRequired && !selectedQuoteKey ? "Pendiente de cotización; no transfieras" : approvedTotal !== null ? currencyFormatter.format(approvedTotal) : currencyFormatter.format(Math.round((productsTotal + shippingFee)*100)/100)}</span>
                  </div>
                  <div><span>Pago</span><span>{paymentLabel}</span></div>
                </div>

                {paymentMethod === "transfer" ? (
                  <p className={styles.info}>No transfieras todavía: los datos de pago aparecen al crear el pedido. Desde que se crea el pedido tenés 24 horas para transferir el 100% del importe e informar el pago. No se admiten señas ni pagos parciales.</p>
                ) : null}

                {unsupportedPayment ? <p role="alert" className={styles.alert}>El método solicitado no está habilitado. Volvé al carrito para elegir un pago manual.</p> : null}
                <CheckoutCaptcha onToken={setCaptchaToken} />
                {submitError ? (
                  <div id="checkout-feedback" ref={feedbackRef} role="alert" tabIndex={-1} className={styles.alert}>
                    {submitError}
                  </div>
                ) : null}
                <button
                  type="submit"
                  aria-describedby={submitError ? "checkout-feedback" : undefined}
                  disabled={isSubmitting || unsupportedPayment || (shippingRequired && !selectedQuoteKey)}
                  className={styles.primary}
                >
                  {isSubmitting ? "Preparando pedido…" : approvedTotal !== null ? "Aceptar total y preparar pedido por transferencia" : checkoutLabel}
                </button>
                {shippingRequired && !selectedQuoteKey ? <p className={styles.muted}>Para continuar, calculá el envío y elegí una tarifa.</p> : null}
              </aside>
            </form>
          )}
        </section>
      </div>
    </CatalogFrame>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CatalogFrame>{null}</CatalogFrame>}>
      <CheckoutContent />
    </Suspense>
  );
}
