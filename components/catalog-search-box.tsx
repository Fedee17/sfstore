"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./site-header.module.css";

type Suggestion = { slug: string; name: string };

export function CatalogSearchBox({ initialQuery, icon }: { initialQuery: string; icon: ReactNode }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; items: Suggestion[]; unavailable?: boolean }>();
  const term = query.trim();
  const expanded = open && term.length >= 2;
  const items = result?.query === term ? result.items : [];

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog/suggestions?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Sugerencias no disponibles");
        const suggestions: Suggestion[] = await response.json();
        if (!controller.signal.aborted) setResult({ query: term, items: suggestions });
      } catch {
        if (!controller.signal.aborted) setResult({ query: term, items: [], unavailable: true });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [expanded, term]);

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => event.key === "ArrowDown"
        ? (index + 1) % items.length
        : index <= 0 ? items.length - 1 : index - 1);
    } else if (event.key === "Enter" && expanded && items[active] && !event.nativeEvent.isComposing) {
      event.preventDefault();
      setOpen(false);
      router.push(`/producto/${encodeURIComponent(items[active].slug)}`);
    }
  }

  return (
    <form action="/buscar" method="get" role="search" className="relative z-40 min-w-0 lg:mx-auto lg:w-full lg:max-w-[820px]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}>
      <label className="sr-only" htmlFor="site-search">Buscar productos</label>
      <div className="flex min-w-0 items-center rounded-full bg-white px-2 text-[#102033] ring-1 ring-white/40 focus-within:ring-2 focus-within:ring-[#B3DAFF]">
        <input id="site-search" name="buscar" type="search" role="combobox" autoComplete="off"
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
          aria-activedescendant={expanded && items[active] ? `${listId}-${active}` : undefined}
          value={query} placeholder="Buscá productos"
          className={`${styles.searchInput} min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-[#526479]`}
          onFocus={() => setOpen(true)} onKeyDown={handleKey}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
            setOpen(true);
          }} />
        <button type="submit" aria-label="Buscar" className="ml-1 flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#0072CE] hover:bg-[#EEF2F6] focus-visible:outline-2">
          {icon}
        </button>
      </div>
      <div className={styles.suggestions} hidden={!expanded}>
        <ul id={listId} role="listbox" aria-label="Productos sugeridos">
          {items.map((item, index) => (
            <li key={item.slug} role="option" id={`${listId}-${index}`} aria-selected={index === active}>
              <a href={`/producto/${encodeURIComponent(item.slug)}`} tabIndex={-1}>{item.name}</a>
            </li>
          ))}
        </ul>
        <p role="status" className={items.length ? "sr-only" : styles.searchEmpty}>
          {result?.query !== term ? "Buscando en todo el catálogo…"
            : result.unavailable ? "Las sugerencias no están disponibles en este momento."
            : items.length ? `${items.length} productos sugeridos`
            : "No encontramos productos para esta búsqueda."}
        </p>
        <button type="submit" className={styles.searchAll}>Ver todos los resultados</button>
      </div>
    </form>
  );
}
