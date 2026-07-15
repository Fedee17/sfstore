export function AccessDenied() {
  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-12 text-center sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
          Admin
        </p>
        <h1 className="mt-4 text-4xl font-semibold">Acceso denegado</h1>
        <p className="mt-4 text-sm leading-6 text-[#1F1F1F]/65">
          Este panel temporal requiere un token de desarrollo valido en la URL.
          Mas adelante se reemplazara por Supabase Auth.
        </p>
      </section>
    </main>
  );
}
