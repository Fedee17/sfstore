import { brand } from "@/lib/brand";
import { transferPayment } from "@/lib/payment";
import { getWhatsAppLink } from "@/lib/whatsapp";
import { getCheckoutSuccessOrder } from "@/services/orders";

type CheckoutSuccessPageProps = {
  searchParams: Promise<{
    order?: string;
    number?: string;
    total?: string;
    pending_mp?: string;
  }>;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function parseTotal(total: string | undefined) {
  const value = Number(total);

  return Number.isFinite(value) ? value : null;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const params = await searchParams;
  const orderId = params.order ?? "";
  const pendingMercadoPago = params.pending_mp === "true";
  const order = parseTotal(params.total)
    ? null
    : await getCheckoutSuccessOrder(orderId);
  const orderNumber = params.number ?? order?.order_number ?? orderId;
  const total = parseTotal(params.total) ?? order?.total ?? null;
  const formattedTotal = total !== null ? currencyFormatter.format(total) : "-";
  const isMercadoPagoOrder =
    pendingMercadoPago || order?.payment_method === "mercadopago";
  const transferMessage = `Hola SFSTORE, ya realicé la transferencia del pedido ${orderNumber} por ${formattedTotal}. Te envío el comprobante.`;

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
            Pedido creado
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
            Orden recibida
          </h1>
          <p className="mt-5 text-base leading-7 text-[#102033]/70">
            Tu pedido fue creado correctamente. Guardá este número para
            coordinar el seguimiento.
          </p>

          <div className="mt-8 rounded-3xl border border-[#0072CE]/20 bg-[#0072CE]/10 p-5">
            <p className="text-sm font-semibold text-[#0072CE]">
              Número de orden
            </p>
            <p className="mt-2 break-all text-3xl font-semibold text-[#102033]">
              {orderNumber}
            </p>
          </div>

          {isMercadoPagoOrder ? (
            <div className="mt-6 rounded-3xl border border-[#003B73]/20 bg-[#EEF2F6] p-5 text-sm leading-6 text-[#102033]/75">
              Recibimos la vuelta de Mercado Pago. Si necesitás confirmar el
              estado del pago, escribinos por WhatsApp con tu número de orden.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-[#0072CE]/20 bg-[#F7F9FC] p-5 text-sm leading-6 text-[#102033]/75">
                <p className="font-semibold text-[#0072CE]">
                  Datos para transferencia
                </p>
                <div className="mt-4 grid gap-3">
                  <TransferField label="Total a transferir" value={formattedTotal} />
                  <TransferField label="Alias" value={transferPayment.alias} />
                  <TransferField label="Titular" value={transferPayment.holder} />
                  <TransferField label="Banco/billetera" value={transferPayment.provider} />
                  <TransferField label="CUIT/CUIL" value={transferPayment.taxId} />
                </div>
              </div>

              <div className="rounded-3xl border border-[#003B73]/15 bg-white/70 p-5 text-sm leading-6 text-[#102033]/70">
                Copiá el alias y el total desde esta pantalla. Cuando termines
                la transferencia, envianos el comprobante por WhatsApp.
              </div>
            </div>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href={getWhatsAppLink(
                isMercadoPagoOrder
                  ? `Hola SFSTORE, realicé un pedido por Mercado Pago. Mi número de orden es: ${orderNumber}`
                  : transferMessage,
              )}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#0072CE] px-6 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#003B73]"
            >
              {isMercadoPagoOrder
                ? "Consultar pedido por WhatsApp"
                : "Enviar comprobante por WhatsApp"}
            </a>
            <a
              href="/"
              className="rounded-full border border-[#0072CE]/35 px-6 py-3.5 text-center text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:bg-[#F7F9FC]"
            >
              Volver al inicio
            </a>
          </div>

          <p className="mt-8 text-sm leading-6 text-[#102033]/55">
            Atención: {brand.hours} · {brand.address}
          </p>
        </div>
      </section>
    </main>
  );
}

function TransferField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#003B73]/15 bg-white/75 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#003B73]">
        {label}
      </p>
      <p className="mt-2 break-all text-lg font-semibold text-[#102033]">
        {value}
      </p>
    </div>
  );
}


