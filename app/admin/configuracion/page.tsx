import { AdminNav } from "@/components/admin/admin-nav";
import { brand } from "@/lib/brand";
import { requireAdminSession } from "@/lib/admin-session";

export default async function AdminConfigPage() {
  await requireAdminSession();

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
          Admin
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Configuracion</h1>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <ConfigCard label="WhatsApp" value={brand.whatsapp} />
          <ConfigCard label="Instagram" value={brand.instagram} />
          <ConfigCard label="Direccion" value={brand.address} />
          <ConfigCard label="Horario" value={brand.hours} />
        </div>

        <div className="mt-8 rounded-3xl border border-[#556B2F]/20 bg-[#556B2F]/10 p-5 text-sm leading-6 text-[#1F1F1F]/70">
          Mas adelante estos datos se podran editar desde la tabla settings.
        </div>
      </section>
    </main>
  );
}

function ConfigCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
      <p className="text-sm font-semibold text-[#8B5E3C]">{label}</p>
      <p className="mt-3 text-xl font-semibold">{value}</p>
    </div>
  );
}
