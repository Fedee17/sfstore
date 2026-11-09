"use client";

import { publicCategoryPaths } from "@/lib/catalog/public-product-visibility";
import { formatWebPrice, getWebTransferPrice, getWebTransferSubtotal, hasValidWebPrice } from "@/lib/web-transfer-pricing";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCartStore, cartItemKey } from "@/store/cart-store";
import { CartItemIdentity } from "@/components/cart-item-identity";
import styles from "./cart.module.css";

export default function CartContent({ compact = false, titleId, onContinueShopping }: {
  compact?: boolean;
  titleId?: string;
  onContinueShopping?: () => void;
}) {
  const { items, totalItems, subtotal, removeItem, increaseQuantity, decreaseQuantity, clearCart, invalidPriceNotice } = useCartStore();
  const hasInvalidPrice = items.some(item => !hasValidWebPrice(item.price));
  const hasRoundedPrice = items.some(item => hasValidWebPrice(item.price) &&
    (!Number.isInteger(item.price) || !Number.isInteger(getWebTransferPrice(item.price))));
  const transferSubtotal = hasInvalidPrice ? null : getWebTransferSubtotal(items);
  const shoppingHref = publicCategoryPaths[items[items.length - 1]?.category ?? "perfumes"];
  const whatsappHref = buildWhatsAppUrl([
    "Hola SFSTORE, quiero consultar por estos productos:",
    ...items.map(item => `${item.quantity} x ${item.name}`),
    "Pago: transferencia bancaria completa.",
    "El precio final con 25% de descuento se confirma al crear el pedido.",
  ].join("\n"));
  const Heading = compact ? "h2" : "h1";

  return (
    <section className={styles.cart} data-compact={compact || undefined}>
      <div className={styles.heading}>
        <Heading id={titleId}>Tu carrito <span>{totalItems}</span></Heading>
        {!compact && items.length > 0 ? <a href={shoppingHref}>Seguir comprando</a> : null}
      </div>
      {invalidPriceNotice ? <p role="status" className={styles.notice}>
        Quitamos del carrito productos sin un precio válido. <a href={buildWhatsAppUrl("Hola SFSTORE, quiero consultar el precio de los productos que se quitaron de mi carrito por no tener precio confirmado.")} target="_blank" rel="noopener noreferrer">Consultar precio</a>.
      </p> : null}
      {items.length === 0 ? (
        <div className={styles.empty}>
          <p>Tu carrito está vacío.</p>
          <div><a className={styles.primary} href="/perfumes">Ver perfumes</a><a className={styles.secondary} href="/mates">Ver mates</a></div>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.items}>
            {items.map(item => {
              const unitPrice = hasValidWebPrice(item.price) ? getWebTransferPrice(item.price) : null;
              return (
                <article key={cartItemKey(item)} className={styles.item}>
                  <CartItemIdentity item={item}>
                    {unitPrice !== null ? <p className={styles.unitPrice}>
                      <s><span className="sr-only">Lista por unidad: </span>{formatWebPrice(item.price)}</s>
                      <span><span className="sr-only">Transferencia por unidad: </span>{formatWebPrice(unitPrice)} <small>c/u</small></span>
                    </p> : <a className={styles.priceQuery} href={buildWhatsAppUrl(`Hola SFSTORE, quiero consultar el precio de ${item.name}. ¿Me lo confirmás?`)} target="_blank" rel="noopener noreferrer">Consultar precio</a>}
                  </CartItemIdentity>
                  <div className={styles.controls}>
                    <div className={styles.quantity}>
                      <button type="button" aria-label={`Quitar una unidad de ${item.name}`} onClick={() => decreaseQuantity(cartItemKey(item))}>−</button>
                      <span aria-label={`Cantidad de ${item.name}`}>{item.quantity}</span>
                      <button type="button" aria-label={`Agregar una unidad de ${item.name}`} onClick={() => increaseQuantity(cartItemKey(item))} disabled={unitPrice === null || item.quantity >= item.stock}>+</button>
                    </div>
                    <p className={styles.lineTotal}><span className="sr-only">Subtotal: </span>{unitPrice === null ? "Precio a confirmar" : formatWebPrice(unitPrice * item.quantity)}</p>
                    <button className={styles.remove} type="button" aria-label={`Eliminar ${item.name} del carrito`} onClick={() => removeItem(cartItemKey(item))}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg>
                    </button>
                  </div>
                </article>
              );
            })}
            <button type="button" className={styles.clear} onClick={clearCart}>Vaciar carrito</button>
          </div>
          <aside className={styles.summary} aria-label="Resumen de compra">
            <div className={styles.total}>
              <span>Total de productos<span className="sr-only"> · Productos por transferencia</span></span>
              <strong>{transferSubtotal === null ? "Precio a confirmar" : formatWebPrice(transferSubtotal)}</strong>
            </div>
            <p className={styles.payment}>25% OFF por transferencia · pago completo.</p>
            <details className={styles.breakdown}>
              <summary>Ver detalle de precios</summary>
              <dl>
                <div><dt>Subtotal de lista</dt><dd>{hasInvalidPrice ? "Pendiente" : formatWebPrice(subtotal)}</dd></div>
                <div><dt>Descuento por transferencia</dt><dd>{transferSubtotal === null ? "Pendiente" : `−${formatWebPrice(Math.round((subtotal - transferSubtotal) * 100) / 100)}`}</dd></div>
              </dl>
            </details>
            {hasRoundedPrice ? <p className={styles.delivery}>Precios redondeados hacia arriba. Al continuar verás el importe exacto, con centavos, antes de confirmar.</p> : null}
            <p className={styles.delivery}>Envío a calcular · retiro sin cargo.</p>
            {hasInvalidPrice ? <p role="alert" className={styles.notice}>Consultá el precio o eliminá los productos sin precio válido para continuar.</p> : <a href="/checkout?payment=transfer" className={styles.primary}>Continuar con transferencia</a>}
            <p className={styles.warning}>No transfieras hasta confirmar el pedido.</p>
            {compact ? <button className={styles.secondary} type="button" onClick={onContinueShopping}>Seguir comprando</button> : null}
            <a className={styles.help} href={whatsappHref} target="_blank" rel="noopener noreferrer">Consultar carrito por WhatsApp</a>
          </aside>
        </div>
      )}
    </section>
  );
}
