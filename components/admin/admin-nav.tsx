import { logoutAdmin } from "@/app/admin/login/actions";

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/configuracion", label: "Configuracion" },
];

export function AdminNav() {
  return (
    <header className="border-b border-[#8B5E3C]/15 bg-[#F7F4ED]">
      {/* TODO: mantener este panel limitado a usuarios autorizados de Supabase Auth. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:px-8 md:flex-row md:items-center md:justify-between">
        <a href="/admin" className="text-lg font-semibold text-[#1F1F1F]">
          SFSTORE Admin
        </a>
        <nav className="flex flex-wrap items-center gap-2">
          {adminLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full border border-[#8B5E3C]/20 px-4 py-2 text-sm font-semibold text-[#1F1F1F]/70 transition hover:border-[#556B2F] hover:text-[#556B2F]"
            >
              {link.label}
            </a>
          ))}
          <form action={logoutAdmin}>
            <button
              type="submit"
              className="rounded-full bg-[#1F1F1F] px-4 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#8B5E3C]"
            >
              Cerrar sesion
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
