import { brand } from "@/lib/brand";
import { getWhatsAppLink } from "@/lib/whatsapp";

type CheckoutPendingPageProps = {
  searchParams: Promise<{
    order?: string;
  }>;
};

export default async function CheckoutPendingPage({
  searchParams,
}: CheckoutPendingPageProps) {
  const params = await searchParams;
  const orderId = params.order ?? "";

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8 lg:py-20">
        <a
          href="/"
          className="text-sm font-semibold text-[#003B73] transition hover:text-[#0072CE]"
        >
          SFSTORE Importados
        </a>

        <div className="mt-10 rounded-[2rem] border border-[#003B73]/15 bg-white/75 p-7 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
            Mercado Pago
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
            Pago pendiente
          </h1>
          <p className="mt-5 text-base leading-7 text-[#102033]/70">
            Tu pago quedÃ³ pendiente. Cuando se confirme, seguimos con la
            preparaciÃ³n. TambiÃ©n podÃ©s escribirnos por WhatsApp si querÃ©s
            revisar el estado.
          </p>

          {orderId ? (
            <div className="mt-8 rounded-3xl border border-[#0072CE]/20 bg-[#0072CE]/10 p-5">
              <p className="text-sm font-semibold text-[#0072CE]">
                Orden relacionada
              </p>
              <p className="mt-2 break-all text-2xl font-semibold text-[#102033]">
                {orderId}
              </p>
            </div>
          ) : null}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href={getWhatsAppLink(
                `Hola SFSTORE, mi pago de Mercado Pago quedÃ³ pendiente${orderId ? ` para el pedido ${orderId}` : ""}. Â¿Me ayudÃ¡s a revisar el estado?`,
              )}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#0072CE] px-6 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#003B73]"
            >
              Consultar por WhatsApp
            </a>
            <a
              href="/"
              className="rounded-full border border-[#0072CE]/35 px-6 py-3.5 text-center text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:bg-[#F7F9FC]"
            >
              Volver al inicio
            </a>
          </div>

          <p className="mt-8 text-sm leading-6 text-[#102033]/55">
            AtenciÃ³n: {brand.hours} Â· {brand.address}
          </p>
        </div>
      </section>
    </main>
  );
}

