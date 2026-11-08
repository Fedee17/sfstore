"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./checkout-admin.module.css";

export function CheckoutRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className={styles.secondary} disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Actualizando..." : "Actualizar"}</button>;
}
