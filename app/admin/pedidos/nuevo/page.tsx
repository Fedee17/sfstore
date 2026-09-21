import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { CustomerOrderForm } from "@/components/admin/orders/customer-order-form";
import { requireAdminSession } from "@/lib/admin-session";
import { listCustomerOrderProducts } from "@/services/customer-orders";

export default async function NewCustomerOrderPage() {
  await requireAdminSession();
  const products = await listCustomerOrderProducts();
  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav /><section className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><Link href="/admin/pedidos" className="text-sm font-semibold text-[#8B5E3C]">Volver a pedidos</Link><h1 className="mt-4 text-4xl font-semibold">Nuevo pedido</h1><p className="mt-2 text-sm text-[#1F1F1F]/60">Registra el acuerdo con el cliente sin reservar ni descontar stock.</p><CustomerOrderForm products={products} /></section></main>;
}
