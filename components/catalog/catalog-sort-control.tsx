"use client";

import Form from "next/form";
import { useId } from "react";
import { CATALOG_ORDER_OPTIONS, type CatalogOrder } from "@/lib/catalog/availability-order";
import styles from "./catalog.module.css";

type Props = {
  basePath: string;
  /** Current search params: filters and category travel with the new order. */
  params: Record<string, string | undefined>;
  order: CatalogOrder | null;
};

/** GET form: the order is a shareable URL param, works without JavaScript and keeps every active filter. */
export function CatalogSortControl({ basePath, params, order }: Props) {
  const id = useId();
  const kept = Object.entries(params).filter((entry): entry is [string, string] => entry[0] !== "orden" && typeof entry[1] === "string" && entry[1] !== "");
  return <Form action={basePath} scroll={false} className="flex min-w-0 items-center justify-end gap-2">
    {kept.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <label htmlFor={id} className={`${styles.hint} shrink-0 text-sm`}>Ordenar por</label>
    <select id={id} name="orden" defaultValue={order ?? ""} onChange={(event) => event.currentTarget.form?.requestSubmit()} className={`${styles.field} min-h-11 min-w-0 rounded-xl px-3 text-sm`}>
      <option value="">Recomendados</option>
      {CATALOG_ORDER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <noscript><button type="submit" className={`${styles.contact} min-h-11 rounded-xl px-3 text-sm font-semibold`}>Aplicar</button></noscript>
  </Form>;
}
