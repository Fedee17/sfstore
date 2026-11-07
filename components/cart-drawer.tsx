"use client";

import { useId, useRef, type ReactNode } from "react";
import CartContent from "./cart-content";
import styles from "./cart-drawer.module.css";

export function CartDrawer({ children, className, label, hidden }: {
  children: ReactNode;
  className: string;
  label: string;
  hidden?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dialogId = useId();

  return (
    <>
      <button type="button" hidden={hidden} className={className} aria-label={label} aria-haspopup="dialog" aria-controls={dialogId}
        onClick={() => dialog.current?.showModal()}>
        {children}
      </button>
      <dialog ref={dialog} id={dialogId} aria-labelledby={titleId} className={styles.drawer}
        onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <button type="button" className={styles.close} aria-label="Cerrar carrito" onClick={() => dialog.current?.close()}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
        <CartContent compact titleId={titleId} onContinueShopping={() => dialog.current?.close()} />
      </dialog>
    </>
  );
}
