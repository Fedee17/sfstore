import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { getAdminUser } from "@/lib/admin-session";

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const user = await getAdminUser();

  if (user) {
    redirect("/admin");
  }

  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-12 sm:px-8">
        <Link href="/" className="text-sm font-semibold text-[#8B5E3C]">
          SFSTORE Importados
        </Link>

        <div className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/75 p-7 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
            Admin
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Ingresar al panel</h1>
          <p className="mt-4 text-sm leading-6 text-[#1F1F1F]/65">
            Acceso privado para administrar pedidos, productos y configuracion.
          </p>

          {params.error ? (
            <div className="mt-6 rounded-2xl border border-[#8B5E3C]/25 bg-[#8B5E3C]/10 p-4 text-sm font-semibold text-[#8B5E3C]">
              {params.error}
            </div>
          ) : null}

          <AdminLoginForm siteKey={(process.env.NEXT_PUBLIC_ADMIN_TURNSTILE_SITE_KEY || process.env.NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY || "").trim()} />

          <p className="mt-6 text-xs leading-5 text-[#1F1F1F]/50">
            No hay registro publico. Los usuarios se crean manualmente desde
            Supabase Auth.
          </p>
        </div>
      </section>
    </main>
  );
}
