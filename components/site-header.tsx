"use client";

import { type FormEvent, useState } from "react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCartStore } from "@/store/cart-store";

const perfumeMenuItems = [
  { href: "/perfumes", label: "Todos los perfumes" },
  { href: "/perfumes?categoria=presencia", label: "Para hacer sentir presencia" },
  { href: "/perfumes?categoria=diario", label: "Para usar todos los días" },
  { href: "/perfumes?categoria=frescos", label: "Frescos y versátiles" },
  { href: "/perfumes?categoria=dulces", label: "Dulces y llamativos" },
  { href: "/perfumes?categoria=nocturnos", label: "Elegantes y nocturnos" },
  { href: "/perfumes?categoria=diferentes", label: "Para salir de lo habitual" },
  { href: "/perfumes?categoria=regalo", label: "Para regalar bien" },
  { href: "/perfumes?categoria=decants", label: "Decants para probar" },
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
      className="relative shrink-0"
      onMouseEnter={() => setOpenMenu(id)}
      onMouseLeave={() => setOpenMenu(null)}
      onFocus={() => setOpenMenu(id)}
    >
      <a
        href={href}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onFocus={() => setOpenMenu(id)}
        className="block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-white/88 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        {label}
      </a>

      {isOpen ? (
        <div className="absolute left-0 top-full z-50 pt-2">
          <div
            role="menu"
            className="grid min-w-[290px] gap-1 rounded-2xl border border-[#DCE3EA] bg-white p-3 text-[#102033] shadow-2xl shadow-[#102033]/15"
          >
            <p className="px-3 pb-2 text-xs font-semibold leading-5 text-[#003B73]/70">
              {helper}
            </p>
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                role="menuitem"
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

export function SiteHeader() {
  const totalItems = useCartStore((state) => state.totalItems);
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const helpHref = buildWhatsAppUrl(
    "Hola SFSTORE, quiero hacer una consulta desde la web.",
  );

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <header className="sticky top-0 z-30 shadow-[0_10px_30px_rgba(16,32,51,0.10)]">
      <div className="bg-[#0072CE] text-white">
        <div className="grid w-full gap-5 px-5 py-4 sm:px-8 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:gap-6 lg:px-10 lg:items-center">
          <a
            href="/"
            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent ring-2 ring-white/20 transition hover:opacity-90 sm:h-[76px] sm:w-[76px] lg:justify-self-start"
            aria-label="Ir al inicio de SFSTORE"
          >
            <img
              src="/Logo%202.png"
              alt="SFSTORE Importados"
              className="h-full w-full scale-[1.08] object-cover"
            />
          </a>

          <form onSubmit={handleSearchSubmit} className="order-3 min-w-0 lg:order-none lg:mx-auto lg:w-full lg:max-w-[820px]" role="search">
            <label className="sr-only" htmlFor="site-search">
              Buscar productos
            </label>
            <div className="flex min-w-0 items-center rounded-full bg-white px-4 py-2.5 text-[#102033] ring-1 ring-white/40 transition focus-within:ring-2 focus-within:ring-[#E52620]">
              <input
                id="site-search"
                name="buscar"
                type="search"
                placeholder="¿Qué estás buscando?"
                className="min-w-0 flex-1 bg-transparent text-center text-base font-semibold outline-none placeholder:font-bold placeholder:text-[#38BDF8] sm:text-lg"
              />
              <button type="submit" aria-label="Buscar" className="ml-3 rounded-full p-1 text-[#0072CE] transition hover:bg-[#EEF2F6]">
                <SearchIcon />
              </button>
            </div>
          </form>

          <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end sm:gap-3 lg:ml-auto">
            <a
              href={helpHref}
              target="_blank"
              rel="noopener noreferrer"
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

      <nav className="border-t border-white/10 bg-[#003B73] text-white" aria-label="Navegación principal">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-2 overflow-visible px-5 py-2.5 text-sm font-semibold sm:px-8">
          <a
            href="/"
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-white/88 transition hover:bg-white/10 hover:text-white"
          >
            Inicio
          </a>
          <DropdownMenu
            id="perfumes"
            label="Perfumes"
            href="/perfumes"
            helper="Elegí según cómo querés oler, no solo por marca."
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
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-white/88 transition hover:bg-white/10 hover:text-white"
          >
            Contacto
          </a>
          <a
            href="#faq"
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-white/88 transition hover:bg-white/10 hover:text-white"
          >
            Preguntas frecuentes
          </a>
        </div>
      </nav>
    </header>
  );
}


