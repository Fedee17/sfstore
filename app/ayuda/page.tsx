import Link from "next/link";
import { CatalogFrame, catalogStyles } from "@/components/catalog/catalog-frame";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { brand, brandLinks } from "@/lib/brand";

export const metadata = { title: "Preguntas frecuentes" };

export default function HelpPage() {
  return (
    <CatalogFrame>
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <h1 className={`${catalogStyles.title} text-3xl sm:text-4xl`}>Preguntas frecuentes</h1>
        <p className={`${catalogStyles.lead} mt-3 text-sm leading-6`}>Lo que necesitás saber para pagar, recibir tu compra o elegir un regalo.</p>
        <p className="mt-4 text-sm leading-6">Retirá en <a href={brandLinks.maps} target="_blank" rel="noopener noreferrer" className="underline">{brand.address}<span className="sr-only"> · Ver mapa, abre una pestaña nueva</span></a>. {brand.hours}. Esperá el aviso de que tu compra está lista.</p>
        <div className="mt-8 grid gap-4">
          {[
            ["¿Cómo pago mi compra?", "Pagás por transferencia bancaria completa, con el precio de contado de los productos, inferior al de lista. Primero prepará el pedido y revisá su total definitivo, incluido el envío si corresponde. No transfieras antes de tener ese importe confirmado."],
            ["¿Dónde adjunto el comprobante?", "Después de crear el pedido, informá el pago y adjuntá el comprobante en la pantalla del pedido. Usá el botón «Informar pago y adjuntar comprobante». Se aceptan PDF, PNG o JPEG de hasta 3 MiB. Guardá esa ventana y tu número de orden. Un mensaje por WhatsApp no reemplaza este paso; respetá el plazo indicado en tu pedido."],
            ["¿El comprobante confirma el pago?", "No. El pago queda informado y pendiente de verificación. El local revisa la acreditación de la transferencia antes de marcar el pago como confirmado. Adjuntar el comprobante no significa que ya esté acreditado ni que tu compra esté lista para retirar."],
            ["¿Cuándo puedo retirar mi compra?", "El retiro en local está disponible de lunes a sábado, de 17:30 a 20:30 hs. Crear el pedido o ver el pago confirmado no es una autorización para retirarlo. Esperá que el local te indique que tu compra está lista y coordiná el retiro. No se garantiza disponibilidad inmediata."],
            ["¿Hacen envíos a todo el país?", "Sí. En el checkout completás los datos de entrega y elegís la empresa de transporte preferida. El costo depende del destino y de una tarifa aprobada por el local; el formulario no contrata el transporte. Si no hay una tarifa disponible, solicitá una cotización y esperá el total definitivo antes de preparar el pedido o transferir. Los plazos de entrega se consultan para cada envío."],
            ["¿Cómo encuentro un producto?", "Usá la búsqueda por nombre o marca, o explorá Perfumes, Mates y Accesorios. En cada catálogo podés elegir las categorías y preferencias disponibles."],
            ["¿Cómo agrego productos a mi compra?", "Abrí el producto o elegí Agregar al carrito desde el catálogo. En el carrito podés revisar los productos, modificar cantidades y continuar con los datos de tu compra."],
            ["¿Qué hago si un producto está agotado?", "Usá Consultar disponibilidad o Sin stock: consultar para preguntarnos por WhatsApp."],
          ].map(([question, answer]) => (
            <details key={question} className={`${catalogStyles.panel} rounded-2xl p-5`}>
              <summary className={`${catalogStyles.heading} ${catalogStyles.question} min-h-11 cursor-pointer rounded-lg py-2 font-semibold`}>{question}</summary>
              <p className={`${catalogStyles.lead} mt-3 text-sm leading-6`}>{answer}</p>
            </details>
          ))}
        </div>
        <section aria-labelledby="gift-help-title" className={`${catalogStyles.panel} mt-8 rounded-2xl p-5`}>
          <h2 id="gift-help-title" className={`${catalogStyles.subtitle} text-xl`}>¿Buscás un regalo?</h2>
          <p className={`${catalogStyles.lead} mt-3 text-sm leading-6`}>Explorá opciones por tu cuenta o pedinos ayuda para elegir.</p>
          <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
            <Link href="/perfumes" className={`${catalogStyles.contact} inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold`}>Explorar Perfumes</Link>
            <Link href="/mates" className={`${catalogStyles.contact} inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold`}>Explorar Mates</Link>
            <a href={buildWhatsAppUrl("Hola SFSTORE, quiero armar un regalo y necesito ayuda para elegir.")} target="_blank" rel="noopener noreferrer" className={`${catalogStyles.primary} inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold`}>Consultar regalos<span className="sr-only"> por WhatsApp, abre una pestaña nueva</span></a>
          </div>
        </section>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/buscar" className={`${catalogStyles.primary} inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold`}>Explorar productos</Link>
          <a href={buildWhatsAppUrl("Hola SFSTORE, tengo una consulta antes de comprar.")} target="_blank" rel="noopener noreferrer" className={`${catalogStyles.contact} inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold`}>Consultar por WhatsApp</a>
        </div>
      </section>
    </CatalogFrame>
  );
}
