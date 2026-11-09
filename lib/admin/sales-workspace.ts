import type { CommercialSnapshot, EvidencePolicy, SaleFact } from "../commercial-reporting/contracts.ts";
import { buildCommercialAnalytics } from "../commercial-reporting/analytics.ts";
import { buildCommercialFacts } from "../commercial-reporting/model.ts";
import { normalizeListOptions, type CommercialListOptions } from "../commercial-reporting/list-reader.ts";
import {buildStockHealth,type StockSnapshot} from './stock-health.ts';

const normalizedText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
export function buildSalesWorkspace(snapshot: CommercialSnapshot, input: CommercialListOptions, month: string, policy: EvidencePolicy, stockSnapshot?: StockSnapshot) {
  const options = normalizeListOptions({ ...input, kind: "sales", paymentStatus: "" });
  const analytics = buildCommercialAnalytics(snapshot, month, policy);
  const facts = buildCommercialFacts(snapshot, policy);
  const search = normalizedText(options.search);
  const sales = facts.sales.filter(sale => {
    if (sale.excluded) return false;
    if (options.origin !== "all" && sale.original.historical_import !== (options.origin === "historical")) return false;
    if (options.channel === "store" && !sale.original.historical_import && sale.original.channel !== "store") return false;
    if (options.channel !== "all" && options.channel !== "store" && sale.original.channel !== options.channel) return false;
    if (options.date && sale.occurredOn !== options.date) return false;
    if (options.from && sale.occurredOn < options.from || options.to && sale.occurredOn > options.to) return false;
    return !search || normalizedText([sale.original.order_number ?? "", ...sale.lines.map(line => line.product_name)].join(" ")).includes(search);
  }).sort(compareSales);
  const pageSize=20, total=sales.length;
  let stockHealth=null;
  if(stockSnapshot) {
    try { stockHealth=buildStockHealth(facts.sales,stockSnapshot,policy); }
    catch { /* Stock failure must not hide the sales history or expose partial stock totals. */ }
  }
  return {analytics,stockHealth, options, sales:sales.slice((options.page-1)*pageSize,options.page*pageSize), total, page:options.page, pageSize, pages:Math.max(1,Math.ceil(total/pageSize))};
}

function compareSales(a: SaleFact, b: SaleFact) {
  return Number(a.original.historical_import)-Number(b.original.historical_import) || b.occurredOn.localeCompare(a.occurredOn) || b.original.created_at.localeCompare(a.original.created_at) || a.id.localeCompare(b.id);
}
