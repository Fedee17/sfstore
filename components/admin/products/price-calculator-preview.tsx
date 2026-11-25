"use client";

import { useState } from "react";
import { adminMoneyText, parseAdminMoneyCents } from "@/lib/products/admin-price-calculation";
import { AmountField, paymentLabel, PriceAdjustment, PriceDisclosure, PriceSummary, secondaryButton } from "./price-preview-fields";
import { makePricePreview, money, profitTarget, readCosts, type PricePair, type PricePreview, type ProfitInput } from "./price-preview-model";

type Props = {
  purchase: string;
  onPurchaseChange: (value: string) => void;
  current?: { list: bigint; cash?: bigint };
  onApply: (prices: PricePair) => void;
  onKeep: () => void;
  openOptions?: boolean;
};

const priceKinds = ["list", "cash"] as const;

function CalculationDetails({ preview, costs, transferRate, setTransferRate }: {
  preview?: PricePreview;
  costs?: ReturnType<typeof readCosts>;
  transferRate: string;
  setTransferRate: (value: string) => void;
}) {
  const results = [...(preview?.cash.results ?? []), ...(preview?.list.results ?? [])];
  return (
    <PriceDisclosure title="Ver detalles del cálculo">
      <div className="grid gap-4 text-sm">
        {costs && <dl className="grid gap-1">
          <div className="flex flex-wrap justify-between gap-x-3"><dt>Costo con adquisición</dt><dd>{money(costs.base)}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-3"><dt>Gastos directos de venta</dt><dd>{money(costs.fixed)}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-3 font-semibold"><dt>Costo total</dt><dd>{money(costs.total)}</dd></div>
        </dl>}
        <p>El sugerido suma costo total y ganancia objetivo, y cubre la comisión del medio más caro de cada grupo. Se redondea hacia arriba a $100 en contado y a $300 en lista.</p>
        <p>Mercado Pago en 1 pago a 35 días: 1,8876% con IVA, consistente con el ≈1,89% del simulador de SFSTORE. La referencia con IVA para 2 cuotas es 11,3135% y para 3 cuotas es 14,5805%. Ambas tasas de cuotas están pendientes de confirmar en la cuenta.</p>
        <div className="grid gap-2 sm:max-w-xs">
          <AmountField label="Comisión total de transferencia" unit="%" value={transferRate} onChange={setTransferRate} placeholder="Sin confirmar" />
          <p className="text-xs text-[#1F1F1F]/70">Para probar una tarifa, ingresá el porcentaje final con impuestos. Si el cobro es gratuito, ingresá 0.</p>
        </div>
        <ul className="grid gap-2">
          {results.map(method => {
            const determines = method.id === preview?.list.limitingMethod?.id ? "lista"
              : method.id === preview?.cash.limitingMethod?.id ? "contado" : undefined;
            return (
              <li key={method.id} className="grid gap-1 border-t border-[#8B5E3C]/15 py-2 sm:grid-cols-[1fr_auto] sm:gap-4">
                <span><strong>{paymentLabel(method.id, method.label)}</strong>{!method.confirmed && " · Provisional"}
                  {determines && <span className="block text-xs text-[#1F1F1F]/75">Mayor costo para el precio de {determines}</span>}
                </span>
                <span>{determines === "lista" || method.id.startsWith("mercadopago-") && method.id !== "mercadopago-1" ? "Comisión y financiación" : "Comisión"} {money(method.feeCents)} · <strong className={method.profitCents < BigInt(0) ? "text-[#9B3027]" : "text-[#465826]"}>Neto {money(method.profitCents)}</strong></span>
              </li>
            );
          })}
          {!transferRate.trim() && <li className="rounded-lg bg-[#F7F4ED] px-3 py-2"><strong>Transferencia</strong> · Comisión pendiente. Ganancia aún sin evaluar.</li>}
        </ul>
      </div>
    </PriceDisclosure>
  );
}

export function PriceCalculatorPreview({ purchase, onPurchaseChange, current, onApply, onKeep, openOptions }: Props) {
  const [acquisition, setAcquisition] = useState("");
  const [selling, setSelling] = useState("");
  const [profit, setProfit] = useState<ProfitInput>({ unit: "money", value: "15000" });
  const [transferRate, setTransferRate] = useState("");
  const [overrides, setOverrides] = useState<Partial<PricePair>>({});
  const [applied, setApplied] = useState<PricePair>();
  const [kept, setKept] = useState(false);
  let costs: ReturnType<typeof readCosts> | undefined;
  let relatedProfit = "";
  let preview: PricePreview | undefined;
  let error: string | undefined;

  try {
    costs = readCosts({ purchase, acquisition, selling });
    const target = profitTarget(costs.total, profit);
    relatedProfit = target.counterpart;
    preview = makePricePreview({ transferRate, overrides }, costs, target.cents);
  } catch (issue) {
    error = issue instanceof Error ? issue.message : "Revisá los importes ingresados.";
  }

  const list = preview?.list.price;
  const cash = preview?.cash.price;
  const comparable = list != null && cash != null && list >= cash;
  const saving = comparable ? {
    cents: list - cash, percentage: Math.round(Number(list - cash) / Number(list) * 10_000) / 100,
  } : undefined;
  const adjusted = overrides.list !== undefined || overrides.cash !== undefined;
  const hasExtras = Boolean(acquisition.trim() || selling.trim());
  const validation = error ?? (list === null || cash === null ? "Revisá el precio manual en Opciones avanzadas."
    : list != null && cash != null && !comparable ? "El contado supera al precio de lista." : undefined);

  function apply() {
    if (!comparable) return;
    const prices = { list: adminMoneyText(list), cash: adminMoneyText(cash) };
    onApply(prices);
    setApplied(prices);
    setKept(false);
  }

  function keep() {
    onKeep();
    setApplied(undefined);
    setKept(true);
  }

  return (
    <section aria-labelledby="price-calculator-title" className="grid min-w-0 gap-5 sm:gap-7">
      <h2 id="price-calculator-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Calculadora de precios</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-3 sm:gap-5">
        <section aria-labelledby="calculator-cost" className="grid min-w-0 gap-2 sm:grid-rows-[auto_1fr]">
          <h3 id="calculator-cost" className="font-semibold">¿Cuánto te costó?</h3>
          <div className="sm:self-end">
            <AmountField label={hasExtras ? "Costo base del producto" : "Costo total del producto"} hideLabel value={purchase} onChange={onPurchaseChange} />
          </div>
        </section>
        <section aria-labelledby="calculator-profit" className="grid min-w-0 gap-2 sm:col-span-2">
          <h3 id="calculator-profit" className="font-semibold">¿Cuánto querés ganar?</h3>
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            <AmountField label="En pesos" value={profit.unit === "money" ? profit.value : relatedProfit} onChange={value => setProfit({ unit: "money", value })} />
            <AmountField label="Sobre el costo" unit="%" value={profit.unit === "percent" ? profit.value : relatedProfit} onChange={value => setProfit({ unit: "percent", value })} />
          </div>
        </section>
      </div>
      <section aria-labelledby="calculator-results" className="grid min-w-0 gap-2.5 sm:gap-3">
        <h3 id="calculator-results" className="font-semibold sm:text-lg">{adjusted ? "Precios para aplicar" : "Precios sugeridos"}</h3>
        {validation && <p role="status" className="text-sm font-medium text-[#9B3027]">{validation}</p>}
        <div aria-live="polite" className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-4">
          {priceKinds.map(kind => <PriceSummary key={kind} kind={kind} price={preview?.[kind].price} saving={saving} />)}
        </div>
      </section>
      <div className="grid gap-2 sm:flex sm:items-center sm:gap-4">
        <button type="button" onClick={apply} disabled={!comparable} className="min-h-12 rounded-full bg-[#556B2F] px-6 py-2 text-sm font-semibold text-white hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-55">Aplicar precios</button>
        <div className="text-sm text-[#1F1F1F]/75 empty:hidden" role="status">
          {applied ? <p>En el formulario · Lista <strong>{money(parseAdminMoneyCents(applied.list))}</strong> · Contado <strong>{money(parseAdminMoneyCents(applied.cash))}</strong></p>
            : kept ? "Precios actuales conservados." : null}
        </div>
      </div>
      <div>
        <PriceDisclosure title="Opciones avanzadas" initiallyOpen={openOptions}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <AmountField label="Gastos de adquisición" value={acquisition} onChange={setAcquisition} placeholder="Opcional" />
                <AmountField label="Gastos directos de venta" value={selling} onChange={setSelling} placeholder="Opcional" />
              </div>
              <p className="text-xs text-[#1F1F1F]/75">Sumá solo gastos que no estén incluidos en el costo que ingresaste.</p>
              {hasExtras && costs && <p className="text-sm font-semibold">Costo total con gastos <output>{money(costs.total)}</output></p>}
            </div>
            <section aria-label="Ajustes manuales" className="grid gap-3 border-t border-[#8B5E3C]/15 pt-3">
              <h4 className="text-sm font-semibold">Ajustes manuales</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {priceKinds.map(kind => <PriceAdjustment key={kind} kind={kind} group={preview?.[kind]} current={current?.[kind]} target={preview?.profit}
                  override={overrides[kind]} onOverride={value => setOverrides(previous => ({ ...previous, [kind]: value }))} />)}
              </div>
              {current && <button type="button" onClick={keep} className={`justify-self-start ${secondaryButton}`}>Conservar precios actuales</button>}
            </section>
          </div>
        </PriceDisclosure>
        <CalculationDetails preview={preview} costs={costs} transferRate={transferRate} setTransferRate={setTransferRate} />
      </div>
    </section>
  );
}
