import { useId, type ReactNode } from "react";
import { adminMoneyText } from "@/lib/products/admin-price-calculation";
import { MAX_INSTALLMENTS } from "@/lib/products/commercial-pricing";
import { money, percent, type PricePair, type PricePreview } from "./price-preview-model";

export const secondaryButton = "min-h-11 rounded-full border border-[#8B5E3C]/30 px-4 py-2 text-sm font-semibold text-[#465826] hover:bg-[#556B2F]/5 focus-visible:outline-2 focus-visible:outline-offset-2";

export function AmountField({ label, value, onChange, unit = "$", placeholder, invalid, hideLabel }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: "$" | "%";
  placeholder?: string;
  invalid?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium leading-5 text-[#1F1F1F]/75"}>{label}</label>
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#8B5E3C]/25 bg-white px-3 focus-within:border-[#556B2F] focus-within:ring-1 focus-within:ring-[#556B2F]">
        {unit === "$" && <span aria-hidden="true" className="text-sm text-[#1F1F1F]/65">$</span>}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
          className="min-h-12 w-full min-w-0 bg-transparent text-base font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-[#1F1F1F]/55"
        />
        {unit === "%" && <span aria-hidden="true" className="text-sm text-[#1F1F1F]/65">%</span>}
      </div>
    </div>
  );
}

export function paymentLabel(id: string, label: string) {
  return id === "mercadopago-1" ? "Mercado Pago en 1 pago" : label;
}

function installmentText(price: bigint) {
  const count = BigInt(MAX_INSTALLMENTS);
  const installment = price / count;
  const remainder = Number(price % count);
  if (!remainder) return `${MAX_INSTALLMENTS} de ${money(installment)}`;
  return `${count - BigInt(remainder)} de ${money(installment)} y ${remainder} de ${money(installment + BigInt(1))}`;
}

function priceDifference(current: bigint, proposed: bigint) {
  const difference = proposed - current;
  if (difference === BigInt(0)) return "Mismo importe";
  return difference > BigInt(0) ? "+" + money(difference) : money(difference);
}

export function PriceDisclosure({ title, children, initiallyOpen }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  return (
    <details open={initiallyOpen || undefined} className="group border-t border-[#8B5E3C]/15">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-semibold text-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-lg font-normal group-open:hidden">+</span>
        <span aria-hidden="true" className="hidden text-lg font-normal group-open:inline">−</span>
      </summary>
      <div className="pb-4 pt-2">{children}</div>
    </details>
  );
}

export function PriceSummary({ kind, price, saving }: {
  kind: keyof PricePair;
  price?: bigint | null;
  saving?: { cents: bigint; percentage: number };
}) {
  const list = kind === "list";
  return (
    <article className="min-w-0 rounded-2xl bg-[#F7F4ED] px-3.5 py-3.5 sm:px-5 sm:py-5">
      <h4 className="text-sm font-semibold sm:text-base">{list ? "Precio de lista" : "Precio de contado"}</h4>
      <p className="mt-1 text-[clamp(1.25rem,6vw,1.75rem)] font-semibold leading-tight tracking-tight text-[#465826] tabular-nums sm:text-4xl [overflow-wrap:anywhere]">
        {price == null ? "—" : money(price)}
      </p>
      {price != null && (list || saving) && (
        <p className="mt-1.5 text-xs leading-5 text-[#1F1F1F]/75 sm:text-sm">
          {list ? <>Hasta {MAX_INSTALLMENTS} cuotas<br className="sm:hidden" /> <span className="hidden sm:inline">· </span>{installmentText(price)}</>
            : saving && <>Ahorrás {money(saving.cents)} <span className="block sm:inline">({percent(saving.percentage)})</span></>}
        </p>
      )}
    </article>
  );
}

export function PriceAdjustment({ kind, group, current, override, onOverride, target }: {
  kind: "list" | "cash";
  group?: PricePreview["list"];
  current?: bigint;
  override?: string;
  onOverride: (value?: string) => void;
  target?: bigint;
}) {
  const list = kind === "list";
  const title = list ? "Precio de lista" : "Precio de contado";
  const price = group?.price;
  const method = group?.limitingMethod;
  const losesMoney = method && method.profitCents < BigInt(0);
  return (
    <div className="grid min-w-0 content-start gap-2">
      <AmountField label={`${title} a usar`} value={override ?? (group ? adminMoneyText(group.suggestion).replace(/\.00$/, "") : "")} onChange={onOverride} invalid={override !== undefined && price === null} />
      {current !== undefined && <p className="text-xs text-[#1F1F1F]/75">Actual <strong>{money(current)}</strong>{group && <> · Sugerido {money(group.suggestion)} ({priceDifference(current, group.suggestion)})</>}</p>}
      {override !== undefined && <button type="button" className="justify-self-start text-sm font-semibold text-[#465826] underline underline-offset-4" onClick={() => onOverride()}>Volver al sugerido</button>}
      <div aria-live="polite" className="grid gap-2 text-sm empty:hidden">
        {price === null && <p className="text-[#9B3027]">Ingresá un precio mayor a cero y con hasta dos decimales.</p>}
        {method && override !== undefined && (
          <>
            <p className={losesMoney ? "text-[#9B3027]" : "text-[#465826]"}>{losesMoney ? "Pérdida estimada" : "Ganancia neta estimada"} <strong>{money(losesMoney ? -method.profitCents : method.profitCents)}</strong></p>
            {target !== undefined && method.profitCents < target && <p className="text-xs font-semibold text-[#9B3027]">Este precio queda por debajo de tu objetivo.</p>}
          </>
        )}
      </div>
    </div>
  );
}
