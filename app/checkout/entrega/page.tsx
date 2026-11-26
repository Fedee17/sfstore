"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CatalogFrame } from "@/components/catalog/catalog-frame";
import { brand } from "@/lib/brand";
import { ARGENTINA_PROVINCES } from "@/lib/checkout/argentina";
import { carriers, deliveryChoiceHref, emptyShippingAddress, saveShippingDraft, useShippingDraft, validateShippingAddress, type Carrier, type ShippingAddress, type ShippingAddressErrors } from "@/lib/checkout/delivery-choice";
import { useCartStore, useCartHydrated } from "@/store/cart-store";
import styles from "../checkout.module.css";

const arrow = <svg aria-hidden="true" className={styles.arrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 6 6 6-6 6" /></svg>;

/** Owner request 20/11: choose how to receive the order before the checkout form; shipping opens its address form right here. */
export default function DeliveryStepPage() {
  const router = useRouter();
  const { items } = useCartStore();
  const cartHydrated = useCartHydrated();
  // Coming back through «Cambiar»: the form opens with what the buyer already typed in this tab.
  const draft = useShippingDraft();
  const [openChoice, setOpenChoice] = useState<boolean | undefined>(undefined);
  const shippingOpen = openChoice ?? draft !== null;
  const [edited, setEdited] = useState<ShippingAddress | null>(null);
  const address = edited ?? draft ?? emptyShippingAddress;
  const [errors, setErrors] = useState<ShippingAddressErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  // Focus the first invalid field only after a submit attempt, never while the buyer is correcting one.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (attempt) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [attempt]);

  const update = <Field extends keyof ShippingAddress>(field: Field, value: ShippingAddress[Field]) => {
    setEdited({ ...address, [field]: value });
    setErrors(current => ({ ...current, [field]: undefined }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateShippingAddress(address);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setAttempt(count => count + 1); return; }
    saveShippingDraft({ ...address, province: address.province.trim(), city: address.city.trim(), address: address.address.trim(), postalCode: address.postalCode.trim() });
    router.push(deliveryChoiceHref("shipping"));
  };
  const field = (name: Exclude<keyof ShippingAddress, "province" | "carrier">, label: string, autoComplete: string) => (
    <div className={styles.field}>
      <label htmlFor={`delivery-${name}`}>{label}</label>
      <input id={`delivery-${name}`} value={address[name]} autoComplete={autoComplete} maxLength={200} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `delivery-error-${name}` : undefined} onChange={event => update(name, event.target.value)} />
      {errors[name] ? <span id={`delivery-error-${name}`} className={styles.error}>{errors[name]}</span> : null}
    </div>
  );

  return (
    <CatalogFrame>
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <section className={styles.step} aria-labelledby="delivery-title">
          <a className={styles.back} href="/carrito"><span aria-hidden="true">←&nbsp;</span>Volver al carrito</a>
          {!cartHydrated ? <div className={styles.loading} aria-busy="true"><h1 id="delivery-title" className="sr-only">Cargando tu carrito…</h1></div> : items.length === 0 ? (
            <div className={`${styles.panel} ${styles.empty}`}>
              <h1 id="delivery-title">Tu carrito está vacío</h1>
              <div>
                <a className={styles.primary} href="/perfumes">Ver perfumes</a>
                <a className={styles.secondary} href="/mates">Ver mates</a>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h1 id="delivery-title">¿Cómo querés recibir tu compra?</h1>
                <p className={styles.lead}>Elegí una opción para seguir.</p>
              </div>
              <div className={styles.options}>
                <a className={styles.option} href={deliveryChoiceHref("pickup")}>
                  <span className={styles.icon}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 10h16v10H4zM3 10l2-5h14l2 5M10 20v-5h4v5" /></svg></span>
                  <span>
                    <strong>Retiro en el local</strong>
                    <span data-free="">Sin cargo</span>
                    <span>{brand.address}. {brand.hours}. Esperá la confirmación del local antes de retirar.</span>
                  </span>
                  {arrow}
                </a>
                <button type="button" className={styles.option} aria-expanded={shippingOpen} aria-controls="delivery-shipping" data-selected={shippingOpen || undefined} onClick={() => setOpenChoice(!shippingOpen)}>
                  <span className={styles.icon}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01" /></svg></span>
                  <span>
                    <strong>Envío a domicilio</strong>
                    <span>Completá tu dirección y en el siguiente paso calculamos el costo.</span>
                  </span>
                  <svg aria-hidden="true" className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6" /></svg>
                </button>
              </div>
              {shippingOpen ? (
                <form id="delivery-shipping" ref={formRef} className={styles.panel} onSubmit={submit} noValidate aria-label="Datos de envío">
                  <div className={styles.fields}>
                    <div className={styles.field}>
                      <label htmlFor="delivery-province">Provincia</label>
                      <select id="delivery-province" value={address.province} autoComplete="address-level1" aria-invalid={Boolean(errors.province)} aria-describedby={errors.province ? "delivery-error-province" : undefined} onChange={event => update("province", event.target.value)}>
                        <option value="">Seleccioná una provincia</option>
                        {ARGENTINA_PROVINCES.map(province => <option key={province} value={province}>{province}</option>)}
                      </select>
                      {errors.province ? <span id="delivery-error-province" className={styles.error}>{errors.province}</span> : null}
                    </div>
                    {field("city", "Localidad", "address-level2")}
                    {field("address", "Dirección", "street-address")}
                    {field("postalCode", "Código postal", "postal-code")}
                    <div className={styles.field}>
                      <label htmlFor="delivery-carrier">Transporte preferido</label>
                      <select id="delivery-carrier" value={address.carrier} aria-invalid={Boolean(errors.carrier)} aria-describedby={errors.carrier ? "delivery-error-carrier" : undefined} onChange={event => update("carrier", event.target.value as Carrier)}>
                        <option value="">Elegí un transporte</option>
                        {carriers.map(carrier => <option key={carrier} value={carrier}>{carrier}</option>)}
                      </select>
                      {errors.carrier ? <span id="delivery-error-carrier" className={styles.error}>{errors.carrier}</span> : null}
                    </div>
                  </div>
                  <button type="submit" className={styles.primary}>Continuar</button>
                </form>
              ) : null}
            </>
          )}
        </section>
      </div>
    </CatalogFrame>
  );
}
