"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cartAddedEvent } from "@/store/cart-store";
import CartContent, { refreshCartCatalog } from "./cart-content";
import styles from "./cart-drawer.module.css";

/** Opens the drawer and refreshes the cart against the current public catalog. */
function showCart(dialog: HTMLDialogElement | null) {
  refreshCartCatalog();
  if (dialog && !dialog.open) dialog.showModal();
}

export function CartDrawer({ children, className, label, hidden }: {
  children: ReactNode;
  className: string;
  label: string;
  hidden?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dialogId = useId();

  // Owner request 20/11: adding a product opens the cart, so the buyer sees it was added and what to do next.
  useEffect(() => {
    const open = () => showCart(dialog.current);
    window.addEventListener(cartAddedEvent, open);
    return () => window.removeEventListener(cartAddedEvent, open);
  }, []);

  return (
    <>
      <button type="button" data-storefront-theme="boutique" hidden={hidden} className={className} aria-label={label} aria-haspopup="dialog" aria-controls={dialogId}
        onClick={() => showCart(dialog.current)}>
        {children}
      </button>
      <dialog ref={dialog} id={dialogId} data-storefront-theme="boutique" aria-labelledby={titleId} className={`${styles.drawer} font-sans`}
        onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <button type="button" className={styles.close} aria-label="Cerrar carrito" onClick={() => dialog.current?.close()}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
        <CartContent compact titleId={titleId} onContinueShopping={() => dialog.current?.close()} />
      </dialog>
    </>
  );
}
