"use client";

import { useActionState, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { confirmPayment, releaseExpired, rejectPayment, setBuyerException, approveShipping, type CheckoutAdminActionState } from "@/app/admin/checkout/actions";
import type { AdminCheckoutRow } from "@/services/checkout-manual-admin";
import { checkoutMoney } from "@/lib/admin/checkout-presentation";
import styles from "./checkout/checkout-admin.module.css";

const initial = { message: "", ok: false };
function ActionStatus({ state }: { state: CheckoutAdminActionState }) {
  return state.message ? <p className={styles.status} role={state.ok ? "status" : "alert"}>{state.message}</p> : null;
}

function ActionField({ label, defaultValue, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { label: string }) {
  const [value, setValue] = useState(String(defaultValue ?? ""));
  return <label>{label}<input {...props} value={value} onChange={event => setValue(event.target.value)} /></label>;
}

function ConsentField({ name, disabled, children }: { name?: string; disabled: boolean; children: ReactNode }) {
  return <label className={styles.check}><input type="checkbox" name={name} required disabled={disabled} /><span>{children}</span></label>;
}

export function ManualCheckoutPaymentForm({ order }: { order: AdminCheckoutRow }) {
  const [state, action, pending] = useActionState(confirmPayment, initial);
  const [operationKey] = useState(order.operation_key);
  return <form action={action} className={styles.form}>
    <input type="hidden" name="orderId" value={order.order_id} />
    <input type="hidden" name="operationKey" value={operationKey} />
    <p className={styles.muted}>Total del pedido: <strong>{checkoutMoney(order.result.total)}</strong>. Contrastalo con el ingreso en tu banco.</p>
    <div className={styles.fields}>
      <ActionField label="Importe recibido completo" name="amount" inputMode="decimal" placeholder="Ingresá el importe acreditado" required disabled={pending || state.ok} />
      <ActionField label="Referencia del cobro" name="reference" maxLength={200} placeholder="Referencia de la transferencia" required disabled={pending || state.ok} />
    </div>
    <ConsentField name="received" disabled={pending || state.ok}>Verifiqué la acreditación bancaria del 100% del total. El comprobante por sí solo no acredita el pago.</ConsentField>
    <button disabled={pending || state.ok} className={styles.button}>{pending ? "Registrando..." : state.ok ? "Pago registrado" : "Acreditar pago manual"}</button>
    <ActionStatus state={state} />
  </form>;
}

export function ReleaseCheckoutReservationsForm() {
  const [state, action, pending] = useActionState(releaseExpired, initial);
  return <form action={action} className={styles.form}>
    <p className={styles.muted}>Sólo libera reservas vencidas sin pago informado. Los avisos de pago en revisión permanecen protegidos.</p>
    <button disabled={pending} className={styles.secondary}>{pending ? "Liberando..." : "Liberar reservas vencidas (hasta 100)"}</button>
    <ActionStatus state={state} />
  </form>;
}

export function RejectCheckoutPaymentForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(rejectPayment, initial);
  return <form action={action} className={styles.form}>
    <input type="hidden" name="orderId" value={orderId} />
    <ActionField label="Motivo del rechazo" name="reason" required minLength={5} maxLength={500} placeholder="Explicá qué verificaste" disabled={pending || state.ok} />
    <ConsentField disabled={pending || state.ok}>Verifiqué que no existe una acreditación real. Entiendo que rechazar cancela el pedido y libera su stock.</ConsentField>
    <button className={styles.danger} disabled={pending || state.ok}>{pending ? "Rechazando..." : "Rechazar aviso y liberar reserva"}</button>
    <ActionStatus state={state} />
  </form>;
}

const exceptionFields = [
  { name: "hours", label: "Duración en horas", max: 24, value: 2 },
  { name: "pending", label: "Pedidos pendientes permitidos", max: 20, value: 3 },
  { name: "units", label: "Unidades totales reservadas", max: 100, value: 8 },
  { name: "productUnits", label: "Unidades por producto", max: 100, value: 4 },
  { name: "reports", label: "Pagos informados simultáneos", max: 20, value: 2 },
];

export function CheckoutBuyerExceptionForm({ buyerId }: { buyerId: string }) {
  const [state, action, pending] = useActionState(setBuyerException, initial);
  return <details className={styles.disclosure}><summary>Excepción temporal del comprador</summary>
    <form action={action} className={styles.form}>
      <input type="hidden" name="buyerId" value={buyerId} />
      <p className={styles.muted}>Usá esta herramienta sólo para resolver un bloqueo revisado. No reemplaza la verificación de stock ni los límites de frecuencia.</p>
      <div className={styles.fields}>{exceptionFields.map(field => <ActionField key={field.name} label={field.label} name={field.name} type="number" min={1} max={field.max} defaultValue={field.value} required disabled={pending || state.ok} />)}</div>
      <ActionField label="Motivo de la excepción" name="reason" minLength={5} maxLength={500} required disabled={pending || state.ok} />
      <button className={styles.secondary} disabled={pending || state.ok}>{pending ? "Registrando..." : "Autorizar excepción"}</button>
      <ActionStatus state={state} />
    </form>
  </details>;
}

export function ShippingQuotationForm({ quoteId }: { quoteId: string }) {
  const [state, action, pending] = useActionState(approveShipping, initial);
  return <form action={action} className={styles.form}>
    <input type="hidden" name="quoteId" value={quoteId} />
    <ActionField label="Costo de envío aprobado" name="shippingFee" inputMode="decimal" placeholder="Importe verificado con el transporte" required disabled={pending || state.ok} />
    <p className={styles.muted}>El comprador deberá consultar y aceptar el total en su checkout. Guardar la cotización no crea un pedido ni reserva stock, y no envía un mensaje.</p>
    <button className={styles.button} disabled={pending || state.ok}>{pending ? "Guardando..." : state.ok ? "Cotización guardada" : "Guardar cotización"}</button>
    <ActionStatus state={state} />
  </form>;
}
