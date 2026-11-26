"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_INSTALLMENTS } from "@/lib/products/commercial-pricing";
import styles from "@/app/checkout/checkout.module.css";

// Payment of a pending Mercado Pago order on its receipt. The order is confirmed only by the server after reading the
// payment from Mercado Pago (webhook or card payment response), never because the buyer returns to this page.
type Props = { orderId: string; mode: "contado" | "financiado"; total: number };
type BrickController = { unmount: () => void };
type MercadoPagoSdk = new (key: string, options: { locale: string }) => {
  bricks: () => { create: (name: string, container: string, settings: unknown) => Promise<BrickController> };
};
declare global { interface Window { MercadoPago?: MercadoPagoSdk } }

const SDK = "https://sdk.mercadopago.com/js/v2";
const errorText = "No se pudo iniciar el pago. Revisá tu pedido o intentá nuevamente en unos minutos.";

function loadSdk(): Promise<MercadoPagoSdk> {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK; script.async = true;
    script.onload = () => window.MercadoPago ? resolve(window.MercadoPago) : reject(new Error("sdk"));
    script.onerror = () => reject(new Error("sdk"));
    document.head.appendChild(script);
  });
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.code ?? "PAYMENT_UNAVAILABLE");
  return data;
}

export function MercadoPagoPayment({ orderId, mode, total }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const brick = useRef<BrickController | null>(null);

  // Returning from Checkout Pro: the webhook may arrive a few seconds later. Re-read the stored status for 2 minutes.
  useEffect(() => {
    if (mode !== "contado") return;
    let left = 24;
    const timer = setInterval(() => { if (left-- <= 0) clearInterval(timer); else router.refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [mode, router]);

  useEffect(() => {
    if (mode !== "financiado") return;
    let cancelled = false;
    (async () => {
      try {
        const state = await fetch("/api/mercadopago/status", { cache: "no-store" }).then(r => r.json());
        if (!state?.enabled || !state.publicKey) throw new Error("disabled");
        const MercadoPago = await loadSdk();
        if (cancelled) return;
        brick.current = await new MercadoPago(state.publicKey, { locale: "es-AR" }).bricks().create("cardPayment", "mp-card-payment", {
          initialization: { amount: total },
          customization: {
            paymentMethods: { types: { included: ["credit_card"] }, minInstallments: 2, maxInstallments: MAX_INSTALLMENTS },
            visual: { style: { theme: "flat" } },
          },
          callbacks: {
            onReady: () => {},
            onError: () => setError(errorText),
            onSubmit: async (form: { token: string; installments: number; payment_method_id: string; issuer_id?: string; payer: { email: string } }) => {
              setError(""); setStatus("Procesando el pago…");
              try {
                const result = await post("/api/mercadopago/card-payment", { orderId, token: form.token, installments: Number(form.installments),
                  paymentMethodId: form.payment_method_id, ...(form.issuer_id ? { issuerId: String(form.issuer_id) } : {}), payerEmail: form.payer.email });
                setStatus(result.status === "approved" ? "Pago aprobado. Actualizando tu pedido…" : "El pago no fue aprobado. Podés intentar con otra tarjeta.");
                router.refresh();
              } catch { setStatus(""); setError(errorText); }
            },
          },
        });
      } catch { if (!cancelled) setError(errorText); }
    })();
    return () => { cancelled = true; brick.current?.unmount(); brick.current = null; };
  }, [mode, orderId, total, router]);

  async function payContado() {
    setBusy(true); setError("");
    try { window.location.assign((await post("/api/mercadopago/create-preference", { orderId })).url); }
    catch { setError(errorText); setBusy(false); }
  }

  return (
    <div className="grid gap-3">
      {mode === "contado"
        ? <button type="button" className={styles.primary} disabled={busy} onClick={payContado}>{busy ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}</button>
        : <div id="mp-card-payment" aria-label="Pago con tarjeta de crédito en cuotas" />}
      {status ? <p role="status" className={styles.info}>{status}</p> : null}
      {error ? <p role="alert" className={styles.alert}>{error}</p> : null}
    </div>
  );
}
