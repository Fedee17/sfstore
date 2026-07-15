"use client";

import { type FormEvent } from "react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCartStore } from "@/store/cart-store";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/perfumes", label: "Perfumes" },
  { href: "/mates", label: "Mates" },
  {
    href: buildWhatsAppUrl("Hola SFSTORE, quiero hacer una consulta desde la web."),
    label: "Contacto",
    external: true,
  },
  { href: "#faq", label: "Preguntas frecuentes" },
];

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

export function SiteHeader() {
  const totalItems = useCartStore((state) => state.totalItems);
  const helpHref = buildWhatsAppUrl(
    "Hola SFSTORE, quiero hacer una consulta desde la web.",
  );

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <header className="sticky top-0 z-30 shadow-[0_10px_30px_rgba(16,32,51,0.10)]">
      <div className="bg-[#0072CE] text-white">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-4 sm:px-8 lg:grid-cols-[190px_minmax(280px,1fr)_auto] lg:items-center">
          <a
            href="/"
            className="relative block h-[42px] w-[150px] max-w-full shrink-0 overflow-hidden rounded-xl bg-white/95 transition hover:opacity-90 sm:h-[48px] sm:w-[178px]"
            aria-label="Ir al inicio de SFSTORE"
          >
            <img
              src="/logo-sfstore-horizontal.png"
              alt="SFSTORE Importados"
              className="absolute left-0 top-0 h-auto w-[202px] max-w-none -translate-x-[26px] -translate-y-[46px] object-contain sm:w-[238px] sm:-translate-x-[30px] sm:-translate-y-[55px]"
            />
          </a>

          <form onSubmit={handleSearchSubmit} className="order-3 min-w-0 lg:order-none" role="search">
            <label className="sr-only" htmlFor="site-search">
              Buscar productos
            </label>
            <div className="flex min-w-0 items-center rounded-full bg-white px-4 py-2.5 text-[#102033] ring-1 ring-white/40 transition focus-within:ring-2 focus-within:ring-[#E52620]">
              <input
                id="site-search"
                name="buscar"
                type="search"
                placeholder="¿Qué estás buscando?"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#102033]/45"
              />
              <button type="submit" aria-label="Buscar" className="ml-3 rounded-full p-1 text-[#0072CE] transition hover:bg-[#EEF2F6]">
                <SearchIcon />
              </button>
            </div>
          </form>

          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
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
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-5 py-2.5 text-sm font-semibold [-ms-overflow-style:none] [scrollbar-width:none] sm:px-8 md:justify-center">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-white/88 transition hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>
    </header>
  );
}
