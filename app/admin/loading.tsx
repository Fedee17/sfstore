export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <div className="border-b border-[#8B5E3C]/15 bg-[#F7F4ED]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="h-6 w-36 animate-pulse rounded bg-[#8B5E3C]/15" />
          <div className="h-9 w-48 animate-pulse rounded-full bg-[#8B5E3C]/10" />
        </div>
      </div>
      <section
        role="status"
        aria-live="polite"
        className="mx-auto max-w-6xl px-5 py-10 sm:px-8"
      >
        <p className="text-sm font-semibold text-[#8B5E3C]">Cargando panel...</p>
        <div className="mt-5 h-10 max-w-md animate-pulse rounded bg-[#8B5E3C]/10" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl bg-white/70" />
          <div className="h-32 animate-pulse rounded-2xl bg-white/70" />
        </div>
      </section>
    </main>
  );
}
