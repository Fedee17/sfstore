// Shared pieces of the admin report charts. Palette validated with the dataviz checks (light surface): blue, orange, aqua.
// Aqua is below 3:1 on the surface, so every chart also ships its values as text (tooltip, labels or a table).
export const CHART_SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
export const compactMoney = (cents: number) => `${cents < 0 ? "−" : ""}$ ${compact.format(Math.abs(cents) / 100)}`;

export function ChartLegend({ items }: { items: { name: string; color: string }[] }) {
  return <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-black/75">
    {items.map(item => <li key={item.name} className="flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ backgroundColor: item.color, height: 3 }} />{item.name}</li>)}
  </ul>;
}

export function ChartTooltip({ leftPercent, title, children }: { leftPercent: number; title: string; children: React.ReactNode }) {
  const align = leftPercent > 70 ? "-translate-x-full" : leftPercent < 30 ? "" : "-translate-x-1/2";
  return <div role="status" className={`pointer-events-none absolute top-8 z-10 min-w-44 rounded-xl border border-black/10 bg-white p-3 text-sm shadow-lg ${align}`} style={{ left: `${leftPercent}%` }}>
    <p className="font-semibold">{title}</p>
    <dl className="mt-2 grid gap-1">{children}</dl>
  </div>;
}

export function TooltipRow({ color, name, value }: { color?: string; name: string; value: string }) {
  return <div className="flex items-center justify-between gap-4">
    <dt className="flex items-center gap-2 text-black/70">{color ? <span aria-hidden="true" className="w-3 rounded-full" style={{ backgroundColor: color, height: 3 }} /> : null}{name}</dt>
    <dd className="font-semibold tabular-nums">{value}</dd>
  </div>;
}
