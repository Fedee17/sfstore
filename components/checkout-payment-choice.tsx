"use client";

import { useEffect, useState } from "react";
import { formatWebPrice } from "@/lib/web-transfer-pricing";
import { financedCftea, MAX_INSTALLMENTS } from "@/lib/products/commercial-pricing";
import styles from "@/app/checkout/checkout.module.css";

// Payment choice in the existing checkout (owner decision 26/11/2026). Transfer stays the default and the only option
// until the server reports Mercado Pago enabled; installments appear only with their own switch (off until SFSTORE
// finances them). Amounts shown here are previews; the server prices the order.
export type CheckoutPayment = "transfer" | "mp-contado" | "mp-cuotas";
export type MercadoPagoAvailability = { enabled: boolean; installments: boolean };

export function useMercadoPagoAvailable(): MercadoPagoAvailability {
  const [availability, setAvailability] = useState<MercadoPagoAvailability>({ enabled: false, installments: false });
  useEffect(() => {
    let active = true;
    fetch("/api/mercadopago/status", { cache: "no-store" }).then(r => r.ok ? r.json() : null)
      .then(data => { if (active) setAvailability({ enabled: data?.enabled === true, installments: data?.enabled === true && data?.installments === true }); })
      .catch(() => { /* transfer only */ });
    return () => { active = false; };
  }, []);
  return availability;
}

export function checkoutRequestPayment(payment: CheckoutPayment) {
  return payment === "transfer" ? { paymentMethod: "transfer" as const }
    : { paymentMethod: "mercadopago" as const, priceMode: payment === "mp-cuotas" ? "financiado" as const : "contado" as const };
}

const cents = (value: number) => Math.round(value * 100);
const percent = (value: number) => value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

/** Installment plan shown with the price (Res. 4/2025): cash price, number and amount of installments, financed total and CFTEA. */
export function installmentLines(cash: number, list: number) {
  return [2, MAX_INSTALLMENTS].filter((n, i, all) => all.indexOf(n) === i).map(n => ({
    installments: n,
    amount: Math.ceil(cents(list) / n) / 100,
    cftea: percent(financedCftea(BigInt(cents(cash)), BigInt(cents(list)), n)),
  }));
}

export function CheckoutPaymentChoice({ value, onChange, cashTotal, listTotal, shipping, installments, disabled }: {
  value: CheckoutPayment; onChange: (value: CheckoutPayment) => void;
  cashTotal: number; listTotal: number; shipping: number; installments: boolean; disabled?: boolean;
}) {
  const option = (id: CheckoutPayment, title: string, total: number, detail: React.ReactNode) => (
    <button key={id} type="button" className={styles.option} aria-pressed={value === id} data-selected={value === id || undefined}
      disabled={disabled} onClick={() => onChange(id)}>
      <span>
        <strong>{title}</strong>
        <span>{detail}</span>
        <span className={styles.paymentTotal}>Total {formatWebPrice(total + shipping)}</span>
      </span>
    </button>
  );
  const plans = listTotal >= cashTotal && cashTotal > 0 ? installmentLines(cashTotal, listTotal) : [];
  return (
    <section className={styles.panel} aria-labelledby="checkout-payment-title">
      <h2 id="checkout-payment-title">¿Cómo querés pagar?</h2>
      <div className={styles.legacyOptions}>
        {option("transfer", "Transferencia bancaria", cashTotal, "Precio de contado. Los datos para transferir aparecen al crear el pedido.")}
        {option("mp-contado", "Mercado Pago · 1 pago", cashTotal, "Precio de contado. Dinero en cuenta, débito o crédito en un pago.")}
        {installments ? option("mp-cuotas", `Mercado Pago · hasta ${MAX_INSTALLMENTS} cuotas`, listTotal,
          <>Precio de lista con tarjeta de crédito. {plans.map(p => `${p.installments} cuotas de ${formatWebPrice(p.amount)} (CFTEA ${p.cftea})`).join(" · ")}. Precio de contado: {formatWebPrice(cashTotal + shipping)}.</>) : null}
      </div>
    </section>
  );
}
