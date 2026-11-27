import { normalizeSearch } from "./search.ts";

/** Same limits as the table checks in 202611290002_search_demand.sql. */
export const SEARCH_DEMAND_MAX_LENGTH = 60;
export const SEARCH_DEMAND_WINDOW_DAYS = 30;
export const SEARCH_DEMAND_TOP = 20;
export type SearchDemandOutcome = "none" | "approximate";
export type SearchDemandRow = { day: string; term: string; outcome: string; searches: number };
export type SearchDemandItem = { term: string; searches: number; days: number };

/**
 * The normalized term, or null when it must not be stored: too short or long, or anything that could be
 * personal data (e-mail, URL, a phone, ID or card number).
 */
export function searchDemandTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lower = raw.toLowerCase();
  if (lower.includes("@") || lower.includes("http") || lower.includes("www.")) return null;
  const term = normalizeSearch(raw).replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (term.length < 2 || term.length > SEARCH_DEMAND_MAX_LENGTH) return null;
  if (/[0-9]{6}/.test(term) || (term.match(/[0-9]/g)?.length ?? 0) >= 8) return null;
  return term;
}

/** Only searches without exact results count as unmet demand. */
export function searchDemandOutcome(resultCount: number, recovered: boolean): SearchDemandOutcome | null {
  if (resultCount === 0) return "none";
  return recovered ? "approximate" : null;
}

export function isLikelyBot(userAgent: string | null | undefined) {
  return !userAgent || /bot|crawl|spider|slurp|preview|externalhit|headless|lighthouse|monitor/i.test(userAgent);
}

/** Totals per term over the window, most searched first, one list per outcome. */
export function summarizeSearchDemand(rows: SearchDemandRow[]) {
  const lists: Record<SearchDemandOutcome, Map<string, SearchDemandItem>> = { none: new Map(), approximate: new Map() };
  let total = 0;
  for (const row of rows) {
    const list = lists[row.outcome as SearchDemandOutcome];
    if (!list) continue;
    const item = list.get(row.term) ?? { term: row.term, searches: 0, days: 0 };
    item.searches += row.searches;
    item.days += 1;
    total += row.searches;
    list.set(row.term, item);
  }
  const top = (list: Map<string, SearchDemandItem>) => [...list.values()].sort((a, b) => b.searches - a.searches || a.term.localeCompare(b.term, "es-AR")).slice(0, SEARCH_DEMAND_TOP);
  return { none: top(lists.none), approximate: top(lists.approximate), total };
}
