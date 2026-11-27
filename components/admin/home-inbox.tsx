import Link from "next/link";
import { getAdminProductPublications } from "@/services/admin";
import { getStockCoverage } from "@/services/commercial-history";
import { listCustomerOrders } from "@/services/customer-orders";
import { buildHomeInbox, type InboxTone } from "@/lib/admin/home-inbox";
import { commercialDate } from "@/lib/commercial-reporting/periods";

const panel = "min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm";
const dot: Record<InboxTone, string> = { critical: "bg-red-700", warning: "bg-amber-500", info: "bg-[#8B5E3C]/50" };
const toneLabel: Record<InboxTone, string> = { critical: "Urgente", warning: "Hoy", info: "Cuando puedas" };

export async function HomeInbox() {
  // Each source fails on its own: a failure is shown as «No pudimos revisar», never as «nada pendiente».
  const [orders, coverage, products] = await Promise.all([
    Promise.all((["pending", "ordered", "ready"] as const).map(status => listCustomerOrders({ status }))).then(groups => groups.flat()).catch(() => null),
    getStockCoverage().catch(() => null),
    getAdminProductPublications({ requireComplete: true }).then(result => result.error ? null : result.data ?? []).catch(() => null),
  ]);
  const inbox = buildHomeInbox({ today: commercialDate(new Date().toISOString()), orders, coverage, products });
  return <div className="mt-4 grid gap-3">
    {inbox.items.length ? <ul className="grid gap-3">{inbox.items.map(item => <li key={item.key}><Link href={item.href} className={`${panel} flex items-start gap-3 hover:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2`}>
      <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot[item.tone]}`} />
      <span className="min-w-0"><span className="block font-semibold"><span className="sr-only">{toneLabel[item.tone]}: </span>{item.title}</span><span className="mt-1 block text-sm text-black/65">{item.detail}</span></span>
    </Link></li>)}</ul> : inbox.unavailable.length ? null : <p className={`${panel} text-sm text-black/65`}>No hay encargos vencidos ni listos, productos por agotarse ni fichas incompletas.</p>}
    {inbox.unavailable.length ? <p role="alert" className="text-sm text-amber-900">No pudimos revisar {inbox.unavailable.join(", ")}. Recargá para reintentar.</p> : null}
  </div>;
}
