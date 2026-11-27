import { adminMoneyFromCents } from "@/lib/admin/money";
import type { PriceMove } from "@/lib/admin/bulk-price";

/** Rounding against the exact amount: negative is a discount for the customer. */
export function roundingLabel(cents: number) {
  if (cents === 0) return "sin redondeo";
  return cents < 0 ? `descuento por redondeo ${adminMoneyFromCents(-cents)}` : `redondeo hacia arriba ${adminMoneyFromCents(cents)}`;
}

export function PriceMoveLine({ label, move }: { label: string; move: PriceMove }) {
  return <span className="block">{label}: {adminMoneyFromCents(move.fromCents)} → <strong>{adminMoneyFromCents(move.toCents)}</strong>{" "}
    <span className="text-black/60">(exacto {adminMoneyFromCents(move.exactCents)} · {roundingLabel(move.roundingCents)})</span></span>;
}

export function AutomaticCashLine({ fromCents, toCents }: { fromCents: number; toCents: number }) {
  return <span className="block">Un pago (75% automático): {adminMoneyFromCents(fromCents)} → <strong>{adminMoneyFromCents(toCents)}</strong></span>;
}
