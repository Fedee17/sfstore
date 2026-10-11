import Link from "next/link";
import { brand } from "@/lib/brand";
import { transferPayment } from "@/lib/payment";
import { getWhatsAppLink } from "@/lib/whatsapp";
import { getBuyerCheckoutReceipt } from "@/services/checkout-buyer-receipt";
import { getCheckoutSuccessOrder } from "@/services/checkout-order-read";

type CheckoutSuccessPageProps = {
  searchParams: Promise<{
    order?: string;
    number?: string;
    total?: string;
  }>;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const params = await searchParams;
  const orderId = params.order ?? "";
  const buyerReceipt = await getBuyerCheckoutReceipt(orderId);
  const order = buyerReceipt ?? await getCheckoutSuccessOrder(orderId);
  if (!order || !["transfer","cash"].includes(order.payment_method) || (buyerReceipt && (!["pending","confirmed"].includes(buyerReceipt.state) || (buyerReceipt.state === "pending" && buyerReceipt.expired)))) {
    return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-semibold">Revisá el estado de tu pedido</h1>
      <p className="mt-4">No hay un pedido pendiente autorizado para mostrar. No realices una transferencia sin confirmar su estado con la tienda.</p>
      <Link href="/carrito">Volver al carrito</Link></main>;
  }
  const orderNumber = order.order_number;
  const total = order.total;
  const formattedTotal = total !== null ? currencyFormatter.format(total) : "-";
  const isPaid = buyerReceipt?.payment_status === "paid";
  const isCashOrder = order.payment_method === "cash";
  const transferMessage = `Hola SFSTORE, ya realicé la transferencia del pedido ${orderNumber} por ${formattedTotal}. Te envío el comprobante.`;

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8 lg:py-20">
        <Link
          href="/"
          className="text-sm font-semibold text-[#003B73] transition hover:text-[#0072CE]"
          prefetch={false}
        >
          SFSTORE Importados
        </Link>

        <div className="mt-10 rounded-[2rem] border border-[#003B73]/15 bg-white/75 p-7 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003B73]">
            Pedido creado
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
            {isPaid ? "Pago acreditado manualmente" : "Orden recibida"}
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

          {isPaid || buyerReceipt?.state === "confirmed" ? (
            <p className="mt-6">{isPaid ? "La tienda acreditó tu pago manualmente. Coordiná el seguimiento de tu pedido." : "Pedido confirmado; el pago sigue pendiente de acreditación. Consultá su estado con la tienda."}</p>
          ) : isCashOrder ? (
            <div className="mt-6 rounded-3xl border border-[#003B73]/20 bg-[#EEF2F6] p-5 text-sm leading-6 text-[#102033]/75">
              Elegiste efectivo al retirar en el local. El pago está pendiente de
              confirmación manual por la tienda. Total: {formattedTotal}.
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
                isPaid || isCashOrder
                  ? `Hola SFSTORE, quiero coordinar el seguimiento del pedido ${orderNumber}.`
                  : transferMessage,
              )}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#0072CE] px-6 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#003B73]"
            >
              {isPaid || isCashOrder
                ? "Consultar pedido por WhatsApp"
                : "Enviar comprobante por WhatsApp"}
            </a>
            <Link
              href="/"
              className="rounded-full border border-[#0072CE]/35 px-6 py-3.5 text-center text-sm font-semibold text-[#003B73] transition hover:border-[#0072CE] hover:bg-[#F7F9FC]"
              prefetch={false}
            >
              Volver al inicio
            </Link>
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


