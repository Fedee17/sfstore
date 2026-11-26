"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { PERFUME_CATALOG_CATEGORIES } from "@/lib/catalog/perfume-filters";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCartStore } from "@/store/cart-store";
import styles from "./site-header.module.css";
import floatingStyles from "./whatsapp-floating-button.module.css";
import { CatalogSearchBox } from "./catalog-search-box";
import { CartDrawer } from "./cart-drawer";

const desktopLink = `${styles.desktopLink} shrink-0 whitespace-nowrap rounded-full transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white`;

const perfumeMenuItems = [
  { href: "/perfumes", label: "Todos los perfumes" },
  ...PERFUME_CATALOG_CATEGORIES.map((category) => ({
    href: `/perfumes?categoria=${category.hrefValue}`,
    label: category.label,
  })),
];

const mateMenuItems = [
  { href: "/mates", label: "Todo matero" },
  { href: "/mates?categoria=mates", label: "Mates" },
  { href: "/mates?categoria=termos", label: "Termos" },
  { href: "/mates?categoria=bombillas", label: "Bombillas" },
  { href: "/mates?categoria=bombillones", label: "Bombillones" },
  { href: "/mates?categoria=materas", label: "Materas" },
  { href: "/mates?categoria=yerbas", label: "Yerbas" },
  { href: "/mates?categoria=latas-yerba", label: "Latas de yerba" },
  { href: "/mates?categoria=dispenser-yerba", label: "Dispenser de yerba" },
  { href: "/mates?categoria=despolvilladores", label: "Despolvilladores" },
  { href: "/mates?categoria=porta-mate", label: "Porta mate" },
  { href: "/mates?categoria=combos-materos", label: "Combos materos" },
  { href: "/mates?categoria=box-regalos-materos", label: "Box/regalos materos" },
];

type MenuKey = "perfumes" | "mates" | null;

type DropdownMenuProps = {
  id: "perfumes" | "mates";
  label: string;
  href: string;
  helper: string;
  items: { href: string; label: string }[];
  openMenu: MenuKey;
  setOpenMenu: Dispatch<SetStateAction<MenuKey>>;
  current: boolean;
};

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21 21-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M6 6h15l-1.5 8.5H8L6 3H3" />
      <path d="M9 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </svg>
  );
}

function DropdownMenu({ id, label, href, helper, items, openMenu, setOpenMenu, current }: DropdownMenuProps) {
  const isOpen = openMenu === id;
  const closeMenu = () => setOpenMenu((menu) => menu === id ? null : menu);
  // Review 21/11 (WCAG 1.4.13): a menu opened by hovering also closes with Escape while focus is elsewhere.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenu((menu) => menu === id ? null : menu); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, id, setOpenMenu]);

  return (
    <div
      className={`${styles.dropdown} relative shrink-0`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpenMenu(id);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" && !event.currentTarget.contains(document.activeElement)) closeMenu();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          closeMenu();
          event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
    >
      <a
        href={href}
        className={desktopLink}
        aria-current={current ? "page" : undefined}
      >
        {label}
      </a>
      <button
        type="button"
        aria-label={`Categorías de ${label}`}
        aria-expanded={isOpen}
        aria-controls={`${id}-categories`}
        onClick={() => setOpenMenu(isOpen ? null : id)}
        className={`${styles.dropdownToggle} rounded-full focus-visible:outline-2 focus-visible:outline-white`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div id={`${id}-categories`} hidden={!isOpen} className="absolute left-4 right-4 top-full z-50 pt-2 lg:left-1/2 lg:right-auto lg:w-[290px] lg:-translate-x-1/2">
        <div className={`${styles.dropdownPanel} grid max-h-[60vh] gap-1 overflow-y-auto rounded-2xl border p-3`}>
          <p className={`${styles.panelHint} px-3 pb-2 text-xs font-semibold leading-5`}>
            {helper}
          </p>
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`${styles.dropdownItem} rounded-xl px-3 py-2 text-sm font-semibold transition`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SiteHeader({ searchQuery = "" }: { searchQuery?: string }) {
  const pathname = usePathname();
  const totalItems = useCartStore((state) => state.totalItems);
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const isProductPage = pathname.startsWith("/producto/");
  // Starts with the visible text so voice control finds it (WCAG 2.5.3).
  const cartLabel = `Mi carrito: ${totalItems} ${totalItems === 1 ? "producto" : "productos"}`;
  const contactHref = buildWhatsAppUrl(
    "Hola SFSTORE, quiero hacer una consulta desde la web.",
  );

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new IntersectionObserver(([entry]) => setHeaderVisible(entry.isIntersecting));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return <>
    {/* Review 21/11 (WCAG 2.4.1): keyboard users skip the header and menus. */}
    <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-[var(--boutique-surface,#fffcf6)] focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-[var(--boutique-olive,#444f25)] focus:shadow-lg focus:outline-2 focus:outline-[var(--boutique-focus,#637134)]">Saltar al contenido</a>
    <header ref={headerRef} className="relative z-30 font-sans">
      <div data-storefront-chrome="" className={`${styles.headerBar} text-white`}>
        <div className={`${styles.headerRow} grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 sm:px-8 lg:grid-cols-[100px_minmax(0,1fr)_auto] lg:gap-5 lg:px-10 lg:py-3`}>
          <Link
            href="/"
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent ring-2 ring-white/20 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-12 sm:w-12 lg:h-14 lg:w-14 lg:justify-self-start"
            aria-label="Ir al inicio de SFSTORE"
            prefetch={false}
          >
            <img
              src="/logo-sfstore.png"
              srcSet="/logo-sfstore-header.webp"
              alt="SFSTORE Importados"
              width={192}
              height={192}
              className="h-full w-full scale-[1.08] object-cover"
            />
          </Link>

          <CatalogSearchBox key={searchQuery} initialQuery={searchQuery} icon={<SearchIcon />} />

          <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end sm:gap-3 lg:ml-auto">
            <a
              href="/carrito"
              className={`${styles.cartLink} inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition sm:px-4`}
              aria-label={cartLabel}
            >
              <CartIcon />
              <span className="hidden sm:inline">Mi carrito</span>
              {totalItems > 0 ? (
                <span className="rounded-full bg-[#E52620] px-2 py-0.5 text-xs font-semibold text-white">
                  {totalItems}
                </span>
              ) : null}
            </a>
          </div>
        </div>
      </div>

      {/* Owner decision 21/11: no floating cart over the delivery/checkout forms either. */}
      {pathname !== "/carrito" && !pathname.startsWith("/checkout") && (
        <CartDrawer label={cartLabel} hidden={headerVisible || (!isProductPage && totalItems === 0)}
          className={`${floatingStyles.cart} ${isProductPage ? floatingStyles.productCart : ""} fixed grid min-h-11 min-w-11 place-items-center rounded-full shadow-xl`}>
          <CartIcon />
          {totalItems > 0 ? <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#E52620] px-1.5 py-0.5 text-center text-xs font-semibold text-white">{totalItems}</span> : null}
        </CartDrawer>
      )}
    </header>
    <span id="contenido" tabIndex={-1} className="block outline-none" />
    <nav data-storefront-chrome="" className={`${styles.navigation} relative z-20 border-t`} aria-label="Navegación principal">
        <div className={`${styles.mobileNav} flex min-h-11 items-center gap-2 overflow-x-auto overscroll-x-contain whitespace-nowrap px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden`} aria-label="Secciones del catálogo">
          <Link href="/perfumes" prefetch={false} aria-current={pathname.startsWith("/perfumes") ? "page" : undefined} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-white">Perfumes</Link>
          <Link href="/mates" prefetch={false} aria-current={pathname.startsWith("/mates") ? "page" : undefined} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-white">Mates</Link>
          <Link href="/accesorios" prefetch={false} aria-current={pathname.startsWith("/accesorios") ? "page" : undefined} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-white">Accesorios</Link>
          <Link href="/ayuda" prefetch={false} aria-current={pathname === "/ayuda" ? "page" : undefined} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-white">Ayuda</Link>
        </div>
        <div className="mx-auto hidden max-w-6xl flex-wrap justify-center gap-1 overflow-visible px-3 py-2 text-sm font-semibold sm:px-8 lg:flex lg:gap-x-6 xl:gap-x-8">
          <Link
            href="/"
            className={desktopLink}
            prefetch={false}
            aria-current={pathname === "/" ? "page" : undefined}
          >
            Inicio
          </Link>
          <DropdownMenu
            id="perfumes"
            label="Perfumes"
            href="/perfumes"
            helper="Explorá las categorías de perfumes disponibles."
            items={perfumeMenuItems}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            current={pathname.startsWith("/perfumes")}
          />
          <DropdownMenu
            id="mates"
            label="Mates"
            href="/mates"
            helper="Armá tu ritual matero completo."
            items={mateMenuItems}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            current={pathname.startsWith("/mates")}
          />
          <Link href="/accesorios" prefetch={false} className={desktopLink} aria-current={pathname.startsWith("/accesorios") ? "page" : undefined}>Accesorios</Link>
          <a
            href={contactHref}
            target="_blank"
            rel="noopener noreferrer"
            className={desktopLink}
          >
            Contacto
          </a>
          <a
            href="/ayuda"
            className={desktopLink}
            aria-current={pathname === "/ayuda" ? "page" : undefined}
          >
            Ayuda
          </a>
        </div>
    </nav>
  </>;
}


