import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { CustomerOrderForm } from "@/components/admin/orders/customer-order-form";
import { requireAdminSession } from "@/lib/admin-session";
import { isCustomerOrderEditable } from "@/lib/orders/workflow";
import { getCustomerOrderById, listCustomerOrderProducts } from "@/services/customer-orders";

type EditOrderPageProps = { params: Promise<{ id: string }> };
export default async function EditCustomerOrderPage({ params }: EditOrderPageProps) {
  await requireAdminSession();
  const { id } = await params;
  const [order, products] = await Promise.all([getCustomerOrderById(id), listCustomerOrderProducts()]);
  if (!order) notFound();
  if (!isCustomerOrderEditable(order.status)) redirect(`/admin/pedidos/${order.id}`);
  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav /><section className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><Link href={`/admin/pedidos/${order.id}`} className="text-sm font-semibold text-[#8B5E3C]">Volver al pedido</Link><h1 className="mt-4 text-4xl font-semibold">Editar pedido</h1><p className="mt-2 text-sm text-[#1F1F1F]/60">El total nuevo no puede quedar por debajo del importe ya pagado.</p><CustomerOrderForm products={products} order={order} /></section></main>;
}
