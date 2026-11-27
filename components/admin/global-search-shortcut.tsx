"use client";

import { useEffect, useRef } from "react";

function typingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Ctrl/Cmd + K, or «/» outside a text field, opens the admin-wide search from any screen. */
export function GlobalSearchShortcut() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const open = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) || event.key === "/" && !typingTarget(event.target);
      if (!open || dialog.current?.open) return;
      event.preventDefault();
      dialog.current?.showModal();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <>
    <button type="button" onClick={() => { dialog.current?.showModal(); input.current?.focus(); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#8B5E3C]/25 bg-white px-4 text-sm font-semibold text-[#465826] hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-offset-2">
      Buscar <kbd className="hidden rounded border border-black/15 px-1.5 text-xs font-normal text-black/60 sm:inline">Ctrl K</kbd>
    </button>
    <dialog ref={dialog} aria-labelledby="global-search-title" className="mx-auto mt-[12vh] w-[min(36rem,calc(100%-2rem))] rounded-2xl border border-[#8B5E3C]/20 bg-white p-5 shadow-xl backdrop:bg-black/30" onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <form action="/admin/buscar" method="get" role="search" className="grid gap-3">
        <label id="global-search-title" htmlFor="global-search-input" className="font-semibold">Buscar en el admin</label>
        <input ref={input} id="global-search-input" name="q" type="search" minLength={2} maxLength={80} required placeholder="Producto, SKU, cliente, número de venta o proveedor" className="h-12 min-w-0 rounded-xl border border-[#8B5E3C]/30 px-4" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-black/60">Enter para buscar · Esc para cerrar</p>
          <button type="submit" className="min-h-11 rounded-xl bg-[#556B2F] px-5 font-semibold text-white">Buscar</button>
        </div>
      </form>
    </dialog>
  </>;
}
