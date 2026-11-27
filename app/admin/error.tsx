"use client";

import Link from "next/link";

// Admin-wide fallback (owner review 27/11): a failed action (archive, featured, photos) used to show Next's default
// error page. Production hides the server message, so the text explains what to check instead of guessing the cause.
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <main className="min-h-screen bg-[#F7F4ED] px-5 py-10 text-[#1F1F1F] sm:px-8">
      <section role="alert" className="mx-auto grid max-w-2xl gap-4 rounded-[2rem] border border-[#8B5E3C]/20 bg-white/80 p-6">
        <h1 className="text-2xl font-semibold">No se pudo completar la acción</h1>
        <p className="text-sm leading-6">
          Puede ser un problema de conexión o un dato que cambió mientras trabajabas. Antes de repetir, revisá si el
          cambio se aplicó: así evitás hacerlo dos veces.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => retry()} className="min-h-11 rounded-full bg-[#556B2F] px-5 text-sm font-semibold text-[#F7F4ED]">
            Volver a intentar
          </button>
          <Link href="/admin/productos" className="inline-flex min-h-11 items-center rounded-full border border-[#556B2F]/30 px-5 text-sm font-semibold text-[#465826]">
            Ir a Productos
          </Link>
          <Link href="/admin" className="inline-flex min-h-11 items-center rounded-full border border-[#8B5E3C]/25 px-5 text-sm font-semibold text-[#8B5E3C]">
            Ir al inicio
          </Link>
        </div>
        {digest ? <p className="text-xs text-[#1F1F1F]/55">Código para soporte: {digest}</p> : null}
      </section>
    </main>
  );
}
