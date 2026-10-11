import "server-only";
import { getAdminUser } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/services/orders";

type CheckoutSuccessOrder = {
  id: string;
  order_number: string;
  total: number;
  payment_method: PaymentMethod;
};

export async function getCheckoutSuccessOrder(orderId: string): Promise<CheckoutSuccessOrder | null> {
  if (!orderId) return null;
  try {
    // A UUID is an identifier, not authorization. Buyer access needs PAY-01's
    // ownership/receipt contract; until then only existing allowlisted admins
    // may read private order data through the service-role boundary.
    if (!(await getAdminUser())) return null;
    const { data, error } = await getSupabaseAdminClient()
      .from("orders")
      .select("id, order_number, total, payment_method")
      .eq("id", orderId)
      .maybeSingle();
    return error ? null : (data as CheckoutSuccessOrder | null);
  } catch {
    return null;
  }
}
