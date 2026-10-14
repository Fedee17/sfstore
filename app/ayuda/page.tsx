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
        <div className="mt-8 grid gap-4">
          {[
            ["¿Cómo encuentro un producto?", "Usá la búsqueda por nombre o marca, o explorá las categorías de perfumes y mates. En cada catálogo podés desplegar las categorías y los filtros disponibles."],
            ["¿Cómo agrego productos a mi compra?", "Abrí el producto o elegí Agregar al carrito desde el catálogo. En el carrito podés revisar los productos, modificar cantidades y continuar con los datos de tu compra."],
            ["¿Qué hago si un producto está agotado?", "Usá Consultar disponibilidad o Sin stock: consultar para preguntarnos por WhatsApp."],
            ["¿Dónde consulto sobre pagos o entregas?", "Revisá las opciones mostradas al continuar tu compra. Si necesitás confirmar un detalle antes de comprar, consultanos por WhatsApp."],
          ].map(([question, answer]) => (
            <details key={question} className="rounded-2xl border border-[#DCE3EA] bg-white p-5">
              <summary className="cursor-pointer font-semibold">{question}</summary>
              <p className="mt-3 text-sm leading-6 text-[#526479]">{answer}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/buscar" className="inline-flex min-h-11 items-center rounded-full bg-[#0072CE] px-5 text-sm font-semibold text-white">Explorar productos</Link>
          <a href={buildWhatsAppUrl("Hola SFSTORE, tengo una consulta antes de comprar.")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-[#0072CE] px-5 text-sm font-semibold text-[#003B73]">Consultar por WhatsApp</a>
        </div>
      </section>
    </main>
  );
}
