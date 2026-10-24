import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const metadata = { title: "Preguntas frecuentes" };

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#102033]">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold sm:text-4xl">Preguntas frecuentes</h1>
        <p className="mt-3 text-sm leading-6 text-[#526479]">Lo que necesitás saber para pagar, recibir tu compra o elegir un regalo.</p>
        <div className="mt-8 grid gap-4">
          {[
            ["¿Cómo pago mi compra?", "Pagás por transferencia bancaria completa, con el 25% de descuento sobre el precio de lista de los productos. Primero prepará el pedido y revisá su total definitivo, incluido el envío si corresponde. No transfieras antes de tener ese importe confirmado."],
            ["¿Dónde adjunto el comprobante?", "Después de crear el pedido, informá el pago y adjuntá el comprobante en la pantalla del pedido. Usá el botón «Informar pago y adjuntar comprobante». Se aceptan PDF, PNG o JPEG de hasta 3 MiB. Guardá esa ventana y tu número de orden. Un mensaje por WhatsApp no reemplaza este paso; respetá el plazo indicado en tu pedido."],
            ["¿El comprobante confirma el pago?", "No. El pago queda informado y pendiente de verificación. El local revisa la acreditación de la transferencia antes de marcar el pago como confirmado. Adjuntar el comprobante no significa que ya esté acreditado ni que tu compra esté lista para retirar."],
            ["¿Cuándo puedo retirar mi compra?", "El retiro en local está disponible de lunes a sábados, de 17:30 a 20:30 hs. Crear el pedido o ver el pago confirmado no es una autorización para retirarlo. Esperá que el local te indique que tu compra está lista y coordiná el retiro. No se garantiza disponibilidad inmediata."],
            ["¿Hacen envíos a todo el país?", "Sí. En el checkout completás los datos de entrega y elegís la empresa de transporte preferida. El costo depende del destino y de una tarifa aprobada por el local; el formulario no contrata el transporte. Si no hay una tarifa disponible, solicitá una cotización y esperá el total definitivo antes de preparar el pedido o transferir. Los plazos de entrega se consultan para cada envío."],
            ["¿Cómo encuentro un producto?", "Usá la búsqueda por nombre o marca, o explorá Perfumes, Mates y Accesorios. En cada catálogo podés elegir las categorías y preferencias disponibles."],
            ["¿Cómo agrego productos a mi compra?", "Abrí el producto o elegí Agregar al carrito desde el catálogo. En el carrito podés revisar los productos, modificar cantidades y continuar con los datos de tu compra."],
            ["¿Qué hago si un producto está agotado?", "Usá Consultar disponibilidad o Sin stock: consultar para preguntarnos por WhatsApp."],
          ].map(([question, answer]) => (
            <details key={question} className="rounded-2xl border border-[#DCE3EA] bg-white p-5">
              <summary className="min-h-11 cursor-pointer rounded-lg py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">{question}</summary>
              <p className="mt-3 text-sm leading-6 text-[#526479]">{answer}</p>
            </details>
          ))}
        </div>
        <section aria-labelledby="gift-help-title" className="mt-8 rounded-2xl border border-[#DCE3EA] bg-white p-5">
          <h2 id="gift-help-title" className="text-xl font-semibold">¿Buscás un regalo?</h2>
          <p className="mt-3 text-sm leading-6 text-[#526479]">Explorá opciones por tu cuenta o pedinos ayuda para elegir.</p>
          <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
            <Link href="/perfumes" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#0072CE] px-5 text-sm font-semibold text-[#003B73] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">Explorar Perfumes</Link>
            <Link href="/mates" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#0072CE] px-5 text-sm font-semibold text-[#003B73] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">Explorar Mates</Link>
            <a href={buildWhatsAppUrl("Hola SFSTORE, quiero armar un regalo y necesito ayuda para elegir.")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0072CE] px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">Consultar regalos<span className="sr-only"> por WhatsApp, abre una pestaña nueva</span></a>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#526479]">«Consultar regalos» abre WhatsApp en una pestaña nueva.</p>
        </section>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/buscar" className="inline-flex min-h-11 items-center rounded-full bg-[#0072CE] px-5 text-sm font-semibold text-white">Explorar productos</Link>
          <a href={buildWhatsAppUrl("Hola SFSTORE, tengo una consulta antes de comprar.")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-[#0072CE] px-5 text-sm font-semibold text-[#003B73]">Consultar por WhatsApp</a>
        </div>
      </section>
    </main>
  );
}
