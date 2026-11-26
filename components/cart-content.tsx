"use client";

import { publicCategoryPaths } from "@/lib/catalog/public-product-visibility";
import { formatWebPrice, getWebTransferSubtotal, hasValidWebPrice } from "@/lib/web-transfer-pricing";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { deliveryStepHref } from "@/lib/checkout/delivery-choice";
import { useEffect, useState } from "react";
import { useCartStore, useCartHydrated, cartItemKey, type CartItem } from "@/store/cart-store";
import { CartItemIdentity } from "@/components/cart-item-identity";
import styles from "./cart.module.css";

const undoMilliseconds = 6000;
const syncIntervalMilliseconds = 30000;
let lastSync = 0;
let syncing = false;

/** Owner request 20/11: bring the cart to the current public price and stock when the buyer looks at it.
 *  Read-only and fail-closed: any network or catalog failure leaves the cart untouched (checkout validates again). */
export function refreshCartCatalog() {
  const { items, syncCatalog } = useCartStore.getState();
  const ids = [...new Set(items.filter(item => !item.comboConnector).map(item => item.productId))].slice(0, 50);
  if (!ids.length || syncing || Date.now() - lastSync < syncIntervalMilliseconds) return;
  syncing = true;
  fetch(`/api/catalog/cart?ids=${ids.map(encodeURIComponent).join(",")}`, { cache: "no-store" })
    .then(response => response.ok ? response.json() : null)
    .then(catalog => { if (catalog && typeof catalog === "object") { lastSync = Date.now(); syncCatalog(catalog); } })
    .catch(() => {})
    .finally(() => { syncing = false; });
}

export default function CartContent({ compact = false, titleId, onContinueShopping }: {
  compact?: boolean;
  titleId?: string;
  onContinueShopping?: () => void;
}) {
  const { items, totalItems, subtotal, removeItem, increaseQuantity, decreaseQuantity, clearCart, restoreItems, invalidPriceNotice, syncNotices = [], clearSyncNotices } = useCartStore();
  const hydrated = useCartHydrated();
  // Owner request 20/11: removing a line or emptying the cart can be undone for a few seconds.
  const [undo, setUndo] = useState<{ text: string; items: CartItem[] } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), undoMilliseconds);
    return () => clearTimeout(timer);
  }, [undo]);
  // The cart page syncs on load; the drawer is always mounted, so CartDrawer syncs when it opens.
  useEffect(() => { if (!compact) refreshCartCatalog(); }, [compact]);
  function removeWithUndo(text: string, remove: () => void) {
    const previous = useCartStore.getState().items;
    remove();
    setUndo({ text, items: previous });
  }
  const hasInvalidPrice = items.some(item => !hasValidWebPrice(item.price) || !hasValidWebPrice(item.transferPrice));
  const transferSubtotal = hasInvalidPrice ? null : getWebTransferSubtotal(items);
  const shoppingHref = publicCategoryPaths[items[items.length - 1]?.category ?? "perfumes"];
  const whatsappHref = buildWhatsAppUrl([
    "Hola SFSTORE, quiero consultar por estos productos:",
    ...items.map(item => `${item.quantity} x ${item.name}`),
    "Pago: transferencia bancaria completa.",
    "El precio final de contado se confirma al crear el pedido.",
  ].join("\n"));
  const Heading = compact ? "h2" : "h1";

  return (
    <section className={styles.cart} data-compact={compact || undefined}>
      <div className={styles.heading}>
        <Heading id={titleId}>Tu carrito <span><span className="sr-only">: </span>{totalItems}<span className="sr-only"> {totalItems === 1 ? "producto" : "productos"}</span></span></Heading>
        {!compact && items.length > 0 ? <a href={shoppingHref}>Seguir comprando</a> : null}
      </div>
      {undo ? <p role="status" className={styles.undo}>
        <span>{undo.text}</span>
        <button type="button" onClick={() => { restoreItems(undo.items); setUndo(null); }}>Deshacer</button>
      </p> : null}
      {syncNotices.length ? <div role="status" className={styles.notice}>
        <ul>{syncNotices.map(notice => <li key={notice}>{notice}</li>)}</ul>
        <button type="button" className={styles.dismiss} onClick={clearSyncNotices}>Entendido</button>
      </div> : null}
      {invalidPriceNotice ? <p role="status" className={styles.notice}>
        Quitamos del carrito productos sin un precio válido. <a href={buildWhatsAppUrl("Hola SFSTORE, quiero consultar el precio de los productos que se quitaron de mi carrito por no tener precio confirmado.")} target="_blank" rel="noopener noreferrer">Consultar precio</a>.
      </p> : null}
      {!hydrated ? <div className={styles.loading} aria-busy="true"><span className="sr-only">Cargando tu carrito…</span></div> : items.length === 0 ? (
        <div className={styles.empty}>
          <p>Tu carrito está vacío.</p>
          <div><a className={styles.primary} href="/perfumes">Ver perfumes</a><a className={styles.secondary} href="/mates">Ver mates</a></div>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.items}>
            {items.map(item => {
              const unitPrice = hasValidWebPrice(item.price) && hasValidWebPrice(item.transferPrice) ? item.transferPrice : null;
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
                      <output aria-live="polite" aria-label={`Cantidad de ${item.name}: ${item.quantity}`}>{item.quantity}</output>
                      <button type="button" aria-label={`Agregar una unidad de ${item.name}`} onClick={() => increaseQuantity(cartItemKey(item))} disabled={unitPrice === null || item.quantity >= item.stock}>+</button>
                    </div>
                    <p className={styles.lineTotal}><span className="sr-only">Subtotal: </span>{unitPrice === null ? "Precio a confirmar" : formatWebPrice(unitPrice * item.quantity)}</p>
                    <button className={styles.remove} type="button" aria-label={`Eliminar ${item.name} del carrito`} onClick={() => removeWithUndo(`Quitaste ${item.displayName ?? item.name}.`, () => removeItem(cartItemKey(item)))}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg>
                    </button>
                  </div>
                  {/* Owner request 20/11: say why «+» stops instead of only disabling it. */}
                  {unitPrice !== null && item.quantity >= item.stock ? <p className={styles.limit}>Máximo disponible: {item.stock} {item.stock === 1 ? "unidad" : "unidades"}.</p> : null}
                </article>
              );
            })}
            <button type="button" className={styles.clear} onClick={() => removeWithUndo("Vaciaste el carrito.", clearCart)}>Vaciar carrito</button>
          </div>
          {/* Owner request 20/11: plain summary. The arithmetic stays visible, one main action, one short note on what comes next. */}
          <aside className={styles.summary} aria-label="Resumen de compra">
            <dl className={styles.lines}>
              <div><dt>Subtotal de lista</dt><dd>{hasInvalidPrice ? "Pendiente" : formatWebPrice(subtotal)}</dd></div>
              <div data-discount=""><dt>Descuento<span className="sr-only"> por transferencia</span></dt><dd>{transferSubtotal === null ? "Pendiente" : `−${formatWebPrice(Math.round((subtotal - transferSubtotal) * 100) / 100)}`}</dd></div>
            </dl>
            <div className={styles.total}>
              <span>Total<span className="sr-only"> · Productos por transferencia</span></span>
              <strong>{transferSubtotal === null ? "Precio a confirmar" : formatWebPrice(transferSubtotal)}</strong>
            </div>
            {hasInvalidPrice ? <p role="alert" className={styles.notice}>Consultá el precio o eliminá los productos sin precio válido para continuar.</p> : <a href={deliveryStepHref} className={styles.primary}>Continuar</a>}
            {/* Owner decision 20/11: no rounding notice in the cart; delivery is chosen in its own step. */}
            <p className={styles.note}>En el siguiente paso elegís envío o retiro sin cargo.</p>
            {compact ? <button className={styles.secondary} type="button" onClick={onContinueShopping}>Seguir comprando</button> : null}
            <a className={styles.help} href={whatsappHref} target="_blank" rel="noopener noreferrer">Consultar carrito por WhatsApp</a>
          </aside>
        </div>
      )}
    </section>
  );
}
