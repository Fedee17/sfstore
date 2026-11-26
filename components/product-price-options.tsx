"use client";

import { useId, type ReactNode } from "react";
import { formatWebPrice } from "@/lib/web-transfer-pricing";
import { financedCftea } from "@/lib/products/commercial-pricing";
import { isValidPaymentPrices, type PaymentPrices } from "@/lib/products/payment-prices";
import { getProductPriceDisplay, PriceTagIcon, ProductPriceUnavailable } from "./product-price-panel";

/** Approved product-page price presentation (Codex, 25/11/2026): list price with installments, then the cash price. */
export type PaymentOption = "installments" | "cash";

/** While installments are disabled the cash price is the only purchasable option, so it starts selected. */
export function initialPaymentOption(installments: number | null): PaymentOption | null {
  return installments ? null : "cash";
}

const decimalPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const valueClass = "product-price-value min-w-0 max-w-full font-extrabold leading-none tracking-tight [overflow-wrap:anywhere]";
const mutedClass = "text-[var(--boutique-muted)]";
const fromClass = "mb-1 block text-xs leading-none font-semibold tracking-normal text-[var(--boutique-olive)]";

function PaymentChoice({ name, title, checked, disabled = false, onSelect, titleClass, hideTitle = false, className = "", children }: {
  name: string;
  title: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  titleClass?: string;
  hideTitle?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <label className={`relative block min-w-0 space-y-2 ${disabled ? "cursor-default" : "cursor-pointer"} ${className}`}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect}
        aria-labelledby={titleId} className="peer sr-only" />
      <span className={`flex min-w-0 items-center justify-between gap-3 rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--boutique-focus)] ${hideTitle ? "absolute end-0 top-1" : ""}`}>
        <span id={titleId} className={hideTitle ? "sr-only" : titleClass}>{title}</span>
        <span aria-hidden="true"
          className={`grid size-6 shrink-0 origin-right place-items-center rounded-full border-2 border-[var(--boutique-olive)] text-sm font-bold leading-none motion-safe:transition-[background-color,scale] motion-safe:duration-200 ${checked ? "scale-105 bg-[var(--boutique-olive)] text-white" : "bg-[var(--boutique-surface)] text-transparent"} ${disabled ? "opacity-40" : ""}`}>
          ✓
        </span>
      </span>
      {children}
    </label>
  );
}

/** Only reachable in the local installments preview: the cart cannot charge installments yet. */
export function PaymentChoiceNotice({ payment }: { payment: PaymentOption | null }) {
  const blocked = payment === "installments";
  return <p role="status" className={blocked ? `text-sm ${mutedClass}` : "sr-only"}>
    {blocked ? "El pago en cuotas todavía no está habilitado en el carrito." : null}
  </p>;
}

function cfteaText({ list, cash }: PaymentPrices, installments: number) {
  const rate = financedCftea(BigInt(Math.round(cash * 100)), BigInt(Math.round(list * 100)), installments);
  return rate.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

function formatCents(cents: number) {
  return cents % 100 === 0 ? formatWebPrice(cents / 100) : decimalPesos.format(cents / 100);
}

/**
 * Prices come from the product (or chosen variant) through lib/products/payment-prices.ts; nothing is recalculated here.
 * `installments` is null while card installments are not an enabled payment method: the line is hidden and
 * the list-price option cannot be chosen.
 */
export function ProductPriceOptions({ prices, from = false, installments, payment, onPaymentChange, showCftea = true }: {
  prices: PaymentPrices | null;
  from?: boolean;
  showCftea?: boolean;
  installments: number | null;
  payment: PaymentOption | null;
  onPaymentChange: (option: PaymentOption) => void;
}) {
  const paymentName = useId();
  if (!isValidPaymentPrices(prices)) return <ProductPriceUnavailable />;
  const display = getProductPriceDisplay(prices);
  const listCents = Math.round(prices.list * 100);
  const installment = installments ? Math.round(listCents / installments) : null;
  const fromLabel = from ? <span className={fromClass}>Desde </span> : null;

  return (
    <fieldset data-testid="product-price-options" aria-label="Precio del producto" className="@container grid min-w-0 gap-3 [overflow-wrap:anywhere]">
      <legend className="sr-only">Elegí cómo pagar</legend>
      <PaymentChoice name={paymentName} title={installments ? "En cuotas" : "Precio de lista (pago en cuotas no disponible)"}
        checked={payment === "installments"} disabled={!installments} onSelect={() => onPaymentChange("installments")} hideTitle>
        <span data-testid="variant-list-price" className={`block pe-9 ${valueClass} text-[clamp(2.25rem,11cqi,2.75rem)] text-[var(--boutique-heading)]`}>
          {fromLabel}{display.list}
        </span>
        {installments && installment !== null && (
          <span data-testid="price-installments" className={`block text-base leading-snug ${mutedClass}`}>
            Mismas {installments} cuotas de <strong className="font-bold text-[var(--boutique-olive)]">{formatCents(installment)}</strong>
            {listCents % installments !== 0 ? " aprox." : null}
          </span>
        )}
        {/* Res. 4/2025 art. 2 d: with installments the page states the cash price (below), their number and amount, and the CFTEA. */}
        {installments && showCftea && (
          <span data-testid="price-cftea" className={`block text-sm leading-snug ${mutedClass}`}>
            CFTEA: {cfteaText(prices, installments)}
          </span>
        )}
      </PaymentChoice>
      <PaymentChoice name={paymentName} title="Otra opción de compra" checked={payment === "cash"}
        onSelect={() => onPaymentChange("cash")} titleClass={`text-sm font-semibold ${mutedClass}`}
        className="border-t border-[var(--boutique-border)] pt-3">
        <span className="grid min-w-0 gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {display.discounted && (
              <span className={`text-lg font-semibold ${mutedClass}`}>
                <span className="sr-only">Precio de lista: </span>
                <s>{display.list}</s>
              </span>
            )}
            <span className="max-w-full rounded-full bg-[var(--boutique-badge)] px-2.5 py-1 text-sm font-bold text-[var(--boutique-olive)]">
              Precio de contado
            </span>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-[var(--boutique-soft)] px-3 py-2.5">
            <span data-testid="variant-transfer-price" className={`${valueClass} grow text-[clamp(1.875rem,9cqi,2.25rem)] text-[var(--boutique-price)]`}>
              {fromLabel}{display.cash}
            </span>
            {display.discounted && (
              <span className="flex min-w-0 max-w-full items-center gap-2 border-s border-[var(--boutique-olive)]/45 ps-3 text-base leading-tight font-semibold text-[var(--boutique-olive)]">
                <PriceTagIcon className="size-5 shrink-0" />
                <span className="min-w-0">
                  Ahorrás
                  <strong data-testid="price-savings" className="block text-lg leading-tight font-bold">{display.savings}</strong>
                </span>
              </span>
            )}
          </span>
        </span>
      </PaymentChoice>
    </fieldset>
  );
}
