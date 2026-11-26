"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import type { CatalogCategoryOption, CatalogFilterGroup } from "./catalog-sidebar";
import { mobileFilterHref, readMobileFilterDraft } from "@/lib/catalog/mobile-filter-state";
import styles from "./catalog.module.css";

type Props = {
  basePath: string;
  categories: CatalogCategoryOption[];
  filtersByCategory: Record<string, CatalogFilterGroup[]>;
  selectedCategory: string;
};

export function MobileCatalogFilters({ basePath, categories, filtersByCategory, selectedCategory }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const savedOverflow = useRef<string | null>(null);
  const [draftCategory, setDraftCategory] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const category = categories.find((item) => item.matchValue === selectedCategory || item.hrefValue === params.get("categoria"));
  const groups = category ? filtersByCategory[category.matchValue] ?? [] : [];
  const selectedDraftCategory = categories.find((item) => item.hrefValue === draftCategory);
  const draftGroups = selectedDraftCategory ? filtersByCategory[selectedDraftCategory.matchValue] ?? [] : [];
  const activeCount = Object.keys(readMobileFilterDraft(groups, new URLSearchParams(params.toString()))).length;

  const groupTitles: Record<string, string> = basePath === "/perfumes"
    ? { familia: "¿Qué aromas te gustan?", intensidad: "¿Qué intensidad preferís?", momento: "¿Para qué ocasión?", genero: "¿Para quién buscás?" }
    : { tipo: "¿Qué estilo de mate te gusta?", material: "¿Qué material preferís?", color: "Elegí un color", uso: "¿Cómo lo vas a usar?" };
  const categoryLabel = basePath === "/perfumes" ? "Tipo de perfume" : "¿Qué estás buscando?";

  function unlock() {
    if (savedOverflow.current !== null) {
      document.body.style.overflow = savedOverflow.current;
      savedOverflow.current = null;
    }
  }

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => { desktop.removeEventListener("change", closeOnDesktop); unlock(); };
  }, []);

  function open() {
    setDraftCategory(category?.hrefValue ?? "");
    setDraft(readMobileFilterDraft(groups, new URLSearchParams(params.toString())));
    savedOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
  }

  function navigate(href: string) {
    startTransition(() => router.push(href, { scroll: false }));
  }

  return <div className="mt-4 min-w-0 lg:hidden" aria-busy={pending}>
    <button ref={opener} type="button" aria-haspopup="dialog" aria-controls={id} disabled={pending} onClick={open} className={`${styles.contact} inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold`}>
      <Image unoptimized src="/icons/adjustments-horizontal.svg" alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 opacity-70" />
      Elegí a tu gusto{activeCount ? ` (${activeCount})` : ""}
    </button>
    <p role="status" className={`${styles.link} mt-1 text-xs`}>{pending ? "Actualizando productos…" : activeCount ? `${activeCount} ${activeCount === 1 ? "preferencia elegida" : "preferencias elegidas"}` : ""}</p>
    <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), summary, a[href], [tabindex='0']")].filter((item) => item.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClose={() => { unlock(); opener.current?.focus({ preventScroll: true }); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
    }} className={`${styles.dialog} fixed inset-x-0 bottom-0 top-auto m-0 h-[58dvh] max-h-[58dvh] w-full max-w-none flex-col overflow-hidden rounded-t-3xl border-0 p-0 shadow-2xl open:flex`}>
      <div className={`${styles.divider} flex shrink-0 items-center justify-between gap-3 px-5 py-2`}>
        <div><h2 id={`${id}-title`} className={`${styles.heading} text-xl font-semibold`}>Elegí a tu gusto</h2><p id={`${id}-description`} className={`${styles.hint} text-xs`}>Encontrá lo que buscás</p></div>
        <button type="button" autoFocus aria-label="Cerrar preferencias" onClick={() => dialog.current?.close()} className={`${styles.contact} min-h-11 min-w-11 rounded-full text-xl`}>×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3" data-testid="filter-scroll-region">
        <label className="mt-3 grid gap-1 text-sm font-semibold">{categoryLabel}
          <select value={draftCategory} className={`${styles.field} min-h-11 rounded-xl px-3 text-base`} onChange={(event) => { setDraftCategory(event.target.value); setDraft({}); }}>
            <option value="">Todos</option>{categories.map((item) => <option key={item.hrefValue} value={item.hrefValue}>{item.label}</option>)}
          </select>
        </label>
        {!draftGroups.length && <p className={`${styles.hint} py-4 text-sm`}>{selectedDraftCategory ? "Ya podés explorar todas estas opciones." : "Elegí qué buscás para personalizar tu selección."}</p>}
        {draftGroups.map((group, index) => <details key={`${draftCategory}-${group.param}`} open={index === 0} className={styles.divider}>
          <summary className={`${styles.heading} min-h-11 cursor-pointer py-3 text-sm font-semibold`}>{groupTitles[group.param] ?? group.label}{draft[group.param] ? `: ${group.options.find((option) => option.value === draft[group.param])?.label}` : ""}</summary>
          <div className="grid grid-cols-2 gap-2 pb-3" role="group" aria-label={groupTitles[group.param] ?? group.label}>
            {group.options.map((option) => <button key={option.value} type="button" aria-pressed={draft[group.param] === option.value} onClick={() => setDraft((current) => ({ ...current, [group.param]: current[group.param] === option.value ? "" : option.value }))} className={`${styles.option} min-h-11 break-words rounded-xl border px-3 py-2 text-sm ${draft[group.param] === option.value ? "font-semibold" : ""}`}>{option.label}</button>)}
          </div>
        </details>)}
      </div>
      <div className={`${styles.dialogBar} flex shrink-0 gap-3 border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]`} data-testid="filter-actions">
        <button type="button" onClick={() => setDraft({})} className={`${styles.contact} min-h-12 rounded-xl px-4 text-sm font-semibold`}>Borrar selección</button>
        <button type="button" onClick={() => { const href = mobileFilterHref(basePath, selectedDraftCategory, draftGroups, draft); dialog.current?.close(); navigate(href); }} className={`${styles.primary} min-h-12 flex-1 rounded-xl px-4 text-sm font-semibold`}>Ver productos</button>
      </div>
    </dialog>
  </div>;
}
