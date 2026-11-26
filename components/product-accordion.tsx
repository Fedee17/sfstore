import type { ReactNode } from "react";

const icons = {
  information: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  delivery: <><path d="M3 17V5h12v12m0-8h4l3 4v4h-3m-10 0h6m-12 0h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
  returns: <><path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z" /><path d="m9 12 2 2 4-4" /></>,
};

export function ProductAccordion({ title, icon, open = false, classes, children }: {
  title: string;
  icon: keyof typeof icons;
  open?: boolean;
  classes?: { panel: string; summary: string; content: string };
  children: ReactNode;
}) {
  return <details open={open} className={`group overflow-hidden rounded-2xl border border-[var(--boutique-border,#DCE3EA)] bg-[var(--boutique-surface,#fff)] ${classes ? classes.panel : ""}`}>
    <summary className={`flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 font-semibold text-[var(--boutique-heading,#102747)] group-open:bg-[var(--boutique-soft,#E8F3FF)] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--boutique-focus,#003B73)] [&::-webkit-details-marker]:hidden ${classes ? classes.summary : ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="size-5 shrink-0">{icons[icon]}</svg>
      {title}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="ms-auto size-5 shrink-0 group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <div className={classes?.content || "space-y-2.5 px-3 py-3 sm:px-4"}>{children}</div>
  </details>;
}
