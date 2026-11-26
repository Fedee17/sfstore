import type { ReactNode } from "react";
import { getPerfumeCommercialCategory } from "@/lib/product-taxonomy";
import { getProductCommercialInformation } from "@/lib/products/commercial-information";
import type { Product } from "@/types/product";
import { publicationAvailable } from "@/lib/products/public-families";
import { getPerfumeHighlights } from "./product-information";
import styles from "./product-detail.module.css";

export const productDetailBuyClass = `${styles.buy} flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--boutique-action,#003B73)] px-4 py-3 text-center font-semibold text-white transition hover:bg-[var(--boutique-heading,#102747)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--boutique-olive,#003B73)] disabled:cursor-not-allowed disabled:bg-[var(--boutique-disabled,#526479)]`;
export const productDetailContactClass = `${styles.contact} flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--boutique-olive,#003B73)] px-4 py-3 text-center font-semibold text-[var(--boutique-olive,#003B73)] transition hover:bg-[var(--boutique-soft,#E8F3FF)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--boutique-olive,#003B73)]`;

export function ProductDetailSummary({ product, selected }: { product: Product; selected?: Product }) {
  const current = selected ?? product;
  const information = product.kind === "family" && !selected ? null : getProductCommercialInformation(current);
  const highlights = information && current.category === "perfumes" ? getPerfumeHighlights(information) : null;
  const category = highlights ? getPerfumeCommercialCategory(current.attributes) : "";
  const presentation = [highlights?.presentation, highlights?.content].filter(Boolean).join(" · ");
  const brand = highlights?.brand;
  const brandPrefix = brand ? brand + " " : "";
  const displayName = brandPrefix && product.name.toLocaleLowerCase("es-AR").startsWith(brandPrefix.toLocaleLowerCase("es-AR"))
    ? product.name.slice(brandPrefix.length).trim() || product.name
    : product.name;
  const available = publicationAvailable(product);

  return <div className={current.category === "perfumes" ? "space-y-3 lg:space-y-4" : "space-y-2"}>
    {brand ? <p className="mb-0.5 text-base font-bold leading-tight text-[var(--boutique-olive,#003B73)] lg:text-lg">{brand}</p> : null}
    <h1 className={`leading-[1.04] font-extrabold tracking-tight text-[var(--boutique-heading,#102747)] [overflow-wrap:anywhere] ${current.category === "perfumes" ? "text-[length:var(--boutique-perfume-title-size,clamp(2.125rem,3vw,2.75rem))] after:mt-2.5 after:block after:h-1 after:w-12 after:rounded-full after:bg-[var(--boutique-title-line,#7a8a48)] lg:after:mt-3" : "text-[length:var(--boutique-title-size,clamp(2.125rem,4vw,3rem))]"}`}>{displayName}</h1>
    {!available || category ? <div className="flex flex-wrap gap-2 text-xs font-semibold">
      {!available ? <span className="rounded-full bg-[var(--boutique-soft,#f3edf0)] px-2.5 py-1 text-[var(--boutique-muted,#74324d)]">Agotado</span> : null}
      {category ? <span className="rounded-full bg-[var(--boutique-soft,#E8F3FF)] px-2.5 py-1 text-[var(--boutique-olive,#003B73)]">{category}</span> : null}
    </div> : null}
    {presentation ? <p className="text-sm font-medium text-[var(--boutique-muted,#45576A)]">{presentation}</p> : null}
    {information?.shortDescription ? <p className="text-base leading-relaxed whitespace-pre-line text-[var(--boutique-ink,#102033)] [overflow-wrap:anywhere] lg:text-lg">{information.shortDescription}</p> : null}
    {highlights?.notes.length ? <ul aria-label="Notas olfativas destacadas" className="flex h-8 min-w-0 flex-wrap content-start gap-x-1 gap-y-2 overflow-clip">
      {highlights.notes.map(({ label, asset }) => <li key={label} className={`${styles.note} inline-flex h-7 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-[var(--boutique-border,#e2d6c6)] px-1 text-[0.6875rem] font-medium text-[var(--boutique-olive,#444f25)]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/perfume-notes/${asset}.webp`} alt="" width={24} height={24} decoding="async" className="size-3.5 shrink-0 rounded-md object-contain mix-blend-multiply" />
        <span className="[overflow-wrap:anywhere]">{label}</span>
      </li>)}
    </ul> : null}
  </div>;
}

export function ProductDetailCartIcon() {
  return <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h3l3 12h11l3-8H6" /><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" />
  </svg>;
}

export function ProductDetailContact({ href, children = "Consultar por WhatsApp" }: { href: string; children?: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={productDetailContactClass}>
    <svg aria-hidden="true" className="size-5 shrink-0 text-[#087A3B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L4 20l.9-4a8.5 8.5 0 1 1 15.6-4.5Z" /><path d="M9 8.5c0 3.1 2.4 5.5 5.5 5.5l1-1.2-2-1-1 1a5 5 0 0 1-2.3-2.3l1-1-1-2Z" />
    </svg>
    {children}
  </a>;
}

export function ProductDetailLayout({ gallery, children, details }: {
  gallery: ReactNode;
  children: ReactNode;
  details: ReactNode;
}) {
  return <>
    <div className="grid gap-3 md:grid-cols-2 md:items-start md:gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10" data-product-detail>
      <div className="min-w-0">{gallery}</div>
      <article className="min-w-0 space-y-3 md:space-y-4">{children}</article>
    </div>
    <div className="mt-4 space-y-2.5 md:mt-8">{details}</div>
  </>;
}
