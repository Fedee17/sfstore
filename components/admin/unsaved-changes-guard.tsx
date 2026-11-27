"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Keeps draft data only in the mounted form; never persists customer or price data. */
// savedRevision: forms that stay mounted after saving pass the id of their last successful save, so only edits made
// after it count as unsaved (owner review 27/11: after the first save, leaving without saving stopped warning).
export function UnsavedChangesGuard({ enabled = true, dirty = false, revision, savedRevision }: { enabled?: boolean; dirty?: boolean; revision?: string; savedRevision?: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const savedRef = useRef(savedRevision);
  const [initialRevision] = useState(revision);
  // null: no edits yet; otherwise the saved revision that was current when the last edit happened.
  const [changedSince, setChangedSince] = useState<string | undefined | null>(null);
  const { pending } = useFormStatus();
  const changed = changedSince !== null && changedSince === savedRevision;
  const warn = enabled && !pending && (dirty || changed || revision !== initialRevision);

  useEffect(() => { savedRef.current = savedRevision; }, [savedRevision]);

  useEffect(() => {
    const form = marker.current?.closest("form");
    const change = () => setChangedSince(savedRef.current);
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
