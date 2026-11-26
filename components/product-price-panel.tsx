import { formatWebPrice } from "@/lib/web-transfer-pricing";
import { getSavingsPercent } from "@/lib/pricing";
import { isValidPaymentPrices, type PaymentPrices } from "@/lib/products/payment-prices";
import styles from "./product-price-panel.module.css";

const exactPesoFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function PriceTagIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3v8L11 21l-8-8L13 3z" /><circle cx="16.5" cy="7.5" r=".75" />
    </svg>
  );
}

/** Shared list / cash display for cards and product pages; the saving is the difference between both amounts. */
export function getProductPriceDisplay({ list, cash }: PaymentPrices) {
  const discounted = cash < list;
  const savings = (Math.round(list * 100) - Math.round(cash * 100)) / 100;
  const listDisplay = formatWebPrice(list);
  const cashDisplay = formatWebPrice(cash);
  const displayExactPrices = discounted && listDisplay === cashDisplay;
  return {
    discounted,
    list: displayExactPrices ? exactPesoFormatter.format(list) : listDisplay,
    cash: displayExactPrices ? exactPesoFormatter.format(cash) : cashDisplay,
    savings: exactPesoFormatter.format(savings),
  };
}

export function ProductPriceUnavailable() {
  return <div><p className="text-sm text-[var(--boutique-muted,#45576A)]">Precio a confirmar</p><p className="text-xl font-semibold">Consultar precio</p></div>;
}

/** Compact price of home and catalog cards. Product pages use ProductPriceOptions. */
export function ProductPricePanel({ prices, from = false }: { prices: PaymentPrices | null; from?: boolean }) {
  if (!isValidPaymentPrices(prices)) return <ProductPriceUnavailable />;
  const display = getProductPriceDisplay(prices);
  const percent = getSavingsPercent(prices.list, prices.cash);
  return <div className={styles.compact} aria-label="Precio del producto">
    {display.discounted ? <div className={styles.listRow}>
      <p className={styles.list}><span className="sr-only">Precio de lista: </span>{from ? "Desde " : ""}<span data-testid="variant-list-price" className="line-through">{display.list}</span></p>
      <span className={styles.badge}>{percent !== null ? `${percent}% OFF · ` : ""}Efectivo / Transferencia</span>
    </div> : null}
    <div className={display.discounted ? styles.valuePanel : undefined}>
      <p data-testid="variant-transfer-price" className={styles.value}>
        {from ? <span className={styles.from}>Desde </span> : null}{display.cash}
      </p>
      {display.discounted ? <p className={styles.savings}>
        <PriceTagIcon className={styles.tagIcon} />
        <span className="[overflow-wrap:anywhere]">Ahorrás<strong className={styles.savingsAmount}>{display.savings}</strong></span>
      </p> : null}
    </div>
  </div>;
}
