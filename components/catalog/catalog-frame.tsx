import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import surface from "@/components/storefront-surface.module.css";
import styles from "./catalog.module.css";

/** Shared public catalog frame: shared header plus the boutique canvas from app/storefront-theme.css. */
export function CatalogFrame({ children, searchQuery }: { children: ReactNode; searchQuery?: string }) {
  return (
    <main className={`${styles.page} font-sans`}>
      <SiteHeader searchQuery={searchQuery} />
      {/* Owner decision 20/11: same botanical corner as the approved product page. */}
      <div data-storefront-theme="boutique" className={`${surface.canvas} ${surface.botanicalCorner} ${styles.canvas} font-sans`}>
        {children}
      </div>
    </main>
  );
}

export function CatalogBackLink({ href }: { href: string }) {
  return (
    <Link href={href} className={`${styles.contact} mt-4 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-4 text-sm font-semibold`}>
      <span aria-hidden="true">←</span> Volver a categorías
    </Link>
  );
}

export function CatalogEmptyState({ title, text, href, action, titleAs: Title = "h3" }: {
  title: string;
  text: string;
  href: string;
  action: string;
  titleAs?: "h2" | "h3";
}) {
  return (
    <div className={`${styles.panel} mt-8 rounded-2xl p-8 text-center`}>
      <Title className={`${styles.heading} text-xl font-semibold`}>{title}</Title>
      <p className={`${styles.emptyText} mt-2 text-sm leading-6`}>{text}</p>
      <Link href={href} className={`${styles.primary} mt-5 inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition`}>
        {action}
      </Link>
    </div>
  );
}

export { styles as catalogStyles };
