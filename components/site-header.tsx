"use client";

import Link from "next/link";
import { useState } from "react";
import { PERFUME_CATALOG_CATEGORIES } from "@/lib/catalog/perfume-filters";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCartStore } from "@/store/cart-store";

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
  setOpenMenu: (menu: MenuKey) => void;
};

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21 21-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5A8.48 8.48 0 0 1 21 11v.5Z" />
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

function DropdownMenu({ id, label, href, helper, items, openMenu, setOpenMenu }: DropdownMenuProps) {
  const isOpen = openMenu === id;

  return (
    <div
      className="shrink-0 lg:relative"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpenMenu(id);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" && !event.currentTarget.contains(document.activeElement)) setOpenMenu(null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpenMenu(null);
          event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
    >
      <a
        href={href}
        className="inline-block whitespace-nowrap rounded-full px-2 py-2 text-sm font-semibold text-white/88 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:px-3"
      >
        {label}
      </a>
      <button
        type="button"
        aria-label={`Categorías de ${label}`}
        aria-expanded={isOpen}
        aria-controls={`${id}-categories`}
        onClick={() => setOpenMenu(isOpen ? null : id)}
        className="min-h-11 min-w-11 rounded-full focus-visible:outline-2 focus-visible:outline-white"
      >
        <span aria-hidden="true">⌄</span>
      </button>

      {isOpen ? (
        <div id={`${id}-categories`} className="absolute left-4 right-4 top-full z-50 pt-2 lg:left-1/2 lg:right-auto lg:w-[290px] lg:-translate-x-1/2">
          <div
            className="grid max-h-[60vh] gap-1 overflow-y-auto rounded-2xl border border-[#DCE3EA] bg-white p-3 text-[#102033] shadow-2xl shadow-[#102033]/15"
          >
            <p className="px-3 pb-2 text-xs font-semibold leading-5 text-[#003B73]/70">
              {helper}
            </p>
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-[#102033] transition hover:bg-[#EEF2F6] hover:text-[#0072CE] focus:bg-[#EEF2F6] focus:outline-none"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader({ searchQuery = "" }: { searchQuery?: string }) {
  const totalItems = useCartStore((state) => state.totalItems);
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const helpHref = buildWhatsAppUrl(
    "Hola SFSTORE, quiero hacer una consulta desde la web.",
  );

  return (
    <header className="relative z-30 shadow-[0_10px_30px_rgba(16,32,51,0.10)] lg:sticky lg:top-0">
      <div className="bg-[#0072CE] text-white">
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-5 py-3 sm:px-8 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:gap-6 lg:px-10">
          <Link
            href="/"
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent ring-2 ring-white/20 transition hover:opacity-90 sm:h-[76px] sm:w-[76px] lg:justify-self-start"
            aria-label="Ir al inicio de SFSTORE"
            prefetch={false}
          >
            <img
              src="/Logo%202.png"
              alt="SFSTORE Importados"
              className="h-full w-full scale-[1.08] object-cover"
            />
          </Link>

          <form action="/buscar" method="get" className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1 lg:mx-auto lg:w-full lg:max-w-[820px]" role="search">
            <label className="sr-only" htmlFor="site-search">
              Buscar productos
            </label>
            <div className="flex min-w-0 items-center rounded-full bg-white px-4 py-1.5 text-[#102033] ring-1 ring-white/40 transition focus-within:ring-2 focus-within:ring-[#E52620]">
              <input
                key={searchQuery}
                id="site-search"
                name="buscar"
                type="search"
                defaultValue={searchQuery}
                placeholder="¿Qué estás buscando?"
                className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-[#526479] sm:text-lg"
              />
              <button type="submit" aria-label="Buscar" className="ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#0072CE] transition hover:bg-[#EEF2F6] focus-visible:outline-2">
                <SearchIcon />
              </button>
            </div>
          </form>

          <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end sm:gap-3 lg:ml-auto">
            <a
              href={helpHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Consultar por WhatsApp"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 sm:px-4"
            >
              <HelpIcon />
              <span className="hidden sm:inline">Ayuda</span>
            </a>
            <a
              href="/carrito"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#003B73] transition hover:bg-[#EEF2F6] sm:px-4"
              aria-label={`Ir al carrito con ${totalItems} productos`}
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

      <nav className="relative border-t border-white/10 bg-[#003B73] text-white" aria-label="Navegación principal">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-1 overflow-visible px-3 py-2 text-sm font-semibold sm:px-8">
          <Link
            href="/"
            className="hidden shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-white/88 transition hover:bg-white/10 hover:text-white sm:block"
            prefetch={false}
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
          />
          <DropdownMenu
            id="mates"
            label="Mates"
            href="/mates"
            helper="Armá tu ritual matero completo."
            items={mateMenuItems}
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
          />
          <a
            href={helpHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-white/88 transition hover:bg-white/10 hover:text-white sm:block"
          >
            Contacto
          </a>
          <a
            href="/ayuda"
            aria-label="Preguntas frecuentes"
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-2 py-2 text-white/88 transition hover:bg-white/10 hover:text-white sm:px-4"
          >
            <span className="sm:hidden">Ayuda</span>
            <span className="hidden sm:inline">Preguntas frecuentes</span>
          </a>
        </div>
      </nav>
    </header>
  );
}


