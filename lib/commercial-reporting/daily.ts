import type { MonthReport } from "./contracts.ts";
import { groupCommercialReceipts } from "./model.ts";
import { sumCents } from "./money.ts";
import { sourceDate } from "./periods.ts";

export function buildCommercialDay(report: MonthReport, day: string) {
  sourceDate(day);
  if (day.slice(0, 7) !== report.month) throw new Error("COMMERCIAL_DAY_MONTH_MISMATCH");
  const sales = report.sales.filter(sale => !sale.excluded && sale.occurredOn === day);
  const confirmed = sales.filter(sale => sale.confirmed);
  const receipts = report.datedReceipts.filter(receipt => receipt.occurredOn === day);
  const pending = report.sales.filter(sale => !sale.excluded && sale.pendingCents > 0);
  return {
    day,
    month: report.month,
    confirmedCount: confirmed.length,
    confirmedCents: sumCents(confirmed.map(sale => sale.totalCents)),
    receiptsCents: sumCents(receipts.map(receipt => receipt.amountCents)),
    methods: groupCommercialReceipts(receipts),
    pendingMonthCount: pending.length,
    pendingMonthCents: sumCents(pending.map(sale => sale.pendingCents)),
    undatedMonthCents: report.totals.undatedApprovedForSalesCents,
    provisional: report.provisional,
    reviewCount: sales.filter(sale => sale.issues.length > 0).length,
  };
}
