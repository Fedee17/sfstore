import { brand } from "@/lib/brand";
import type { CatalogAttribute } from "@/lib/catalog/attribute-config";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { DecantShippingPreview } from "@/components/decant-shipping-preview";
import { ProductAccordion } from "./product-accordion";
import styles from "./product-detail.module.css";


type PurchaseConditionsProps = {
  attributes?: CatalogAttribute[];
  productName: string;
  showShippingPreview?: boolean;
};

export function ProductPurchaseConditions({ attributes = [], productName, showShippingPreview = false, standalone = false }: PurchaseConditionsProps & { standalone?: boolean }) {
  const originality = [...new Set(attributes.filter(attribute => /^(originalidad|autenticidad)$/i.test(attribute.name.trim())).map(attribute => attribute.value.trim()).filter(Boolean))];
  return <div className={standalone ? "space-y-2 text-sm leading-6 text-[var(--boutique-muted,#45576A)]" : "space-y-2 border-t border-[var(--boutique-border,#DCE3EA)] pt-4 text-xs leading-5 text-[var(--boutique-muted,#45576A)]"} aria-label="Entrega y retiro">
    <p><strong className="font-semibold text-[var(--boutique-ink,#102033)]">Retiro.</strong> {brand.address}. {brand.hours}. Esperá la confirmación del local para retirar.</p>
    <p><strong className="font-semibold text-[var(--boutique-ink,#102033)]">Envíos.</strong> El costo y el plazo dependen del destino. {standalone ? "Revisá el total con el envío antes de pagar." : null}</p>
    {showShippingPreview ? <DecantShippingPreview /> : !standalone ? <a className="inline-flex min-h-11 items-center rounded-xl border border-[var(--boutique-olive,#003B73)]/25 px-3 py-2 font-semibold text-[var(--boutique-olive,#003B73)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--boutique-focus,#0072CE)]"
      href={buildWhatsAppUrl(`Hola SFSTORE, quiero cotizar el envío de ${productName}. Mi localidad y código postal son: `)}
      target="_blank" rel="noopener noreferrer">Cotizar envío por WhatsApp<span className="sr-only">, abre una pestaña nueva</span></a> : null}
    {originality.length ? <p><strong className="font-semibold text-[var(--boutique-ink,#102033)]">Originalidad.</strong> {originality.join(" · ")}</p> : null}
  </div>;
}

const sectionClassName = "min-w-0 space-y-3 rounded-3xl border border-[var(--boutique-border,#DCE3EA)] bg-[var(--boutique-surface,#fff)] p-5 sm:p-7";
const linkClassName = "inline-flex min-h-11 items-center text-sm font-semibold text-[var(--boutique-olive,#003B73)] underline underline-offset-4";

const supportClasses = { panel: styles.support, summary: "", content: "" };

export function ProductSupportSections(props: PurchaseConditionsProps & { showShippingContact?: boolean }) {
  const supportUrl = buildWhatsAppUrl(`Hola SFSTORE, necesito ayuda con la garantía o devolución de ${props.productName}.`);
  return <>
    <ProductAccordion title="Envíos y retiro" icon="delivery" classes={supportClasses}>
      <ProductPurchaseConditions {...props} standalone={!props.showShippingContact} />
      <a className={linkClassName} href="/ayuda">Ver preguntas frecuentes</a>
    </ProductAccordion>
    <ProductAccordion title="Garantía y devoluciones" icon="returns" classes={supportClasses}>
      <p className="text-sm leading-6 text-[var(--boutique-muted,#45576A)]">Si tu pedido llegó dañado, recibiste otro producto o necesitás gestionar una devolución, contactanos con tu número de pedido para que podamos ayudarte.</p>
      <a className={linkClassName} href={supportUrl} target="_blank" rel="noopener noreferrer">Contactar a SFSTORE por WhatsApp</a>
    </ProductAccordion>
  </>;
}

export function PerfumeReviewLinks({ communityUrl }: { communityUrl?: string }) {
  return <section aria-labelledby="product-reviews" className={`${sectionClassName} ${styles.reviews}`}>
    <h2 id="product-reviews" className="text-xl font-semibold">Opiniones sobre este perfume</h2>
    <p className="text-sm leading-6 text-[var(--boutique-muted,#45576A)]">Todavía no hay reseñas de clientes de SFSTORE publicadas en esta ficha.</p>
    {communityUrl ? <a className={linkClassName} href={communityUrl} target="_blank" rel="noopener noreferrer">Leer opiniones de la comunidad en Fragrantica</a> : null}
  </section>;
}
