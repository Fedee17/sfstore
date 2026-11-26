import { isMercadoPagoEnabled } from "@/lib/payments/mercadopago";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

// Whether the checkout may offer Mercado Pago: server credentials AND the database switch. Fails closed.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!isMercadoPagoEnabled(process.env) || !process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY) return Response.json({ enabled: false }, { headers });
  try {
    const { data, error } = await getSupabaseAdminClient().rpc("mercadopago_payments_enabled");
    return Response.json(data === true && !error ? { enabled: true, publicKey: process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY } : { enabled: false }, { headers });
  } catch { return Response.json({ enabled: false }, { headers }); }
}
