"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Keeps draft data only in the mounted form; never persists customer or price data. */
export function UnsavedChangesGuard({ enabled = true, dirty = false, revision }: { enabled?: boolean; dirty?: boolean; revision?: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [initialRevision] = useState(revision);
  const [changed, setChanged] = useState(false);
  const { pending } = useFormStatus();
  const warn = enabled && !pending && (dirty || changed || revision !== initialRevision);

  useEffect(() => {
    const form = marker.current?.closest("form");
    const change = () => setChanged(true);
    form?.addEventListener("input", change);
    form?.addEventListener("change", change);
    return () => { form?.removeEventListener("input", change); form?.removeEventListener("change", change); };
  }, []);

  useEffect(() => {
    if (!warn) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const next = new URL(link.href, location.href);
      if (next.pathname === location.pathname && next.search === location.search) return;
      if (!window.confirm("Tenés cambios sin guardar. ¿Querés salir y descartarlos?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [warn]);

  return <span ref={marker} hidden />;
}
