import { isMercadoPagoEnabled } from "@/lib/payments/mercadopago";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

// Whether the checkout may offer Mercado Pago (server credentials AND the database switch) and, separately, installments
// (their own database switch, off until SFSTORE finances them). Fails closed.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const off = { enabled: false, installments: false };
  if (!isMercadoPagoEnabled(process.env) || !process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY) return Response.json(off, { headers });
  try {
    const client = getSupabaseAdminClient();
    const [payments, installments] = await Promise.all([client.rpc("mercadopago_payments_enabled"), client.rpc("mercadopago_installments_enabled")]);
    if (payments.error || payments.data !== true) return Response.json(off, { headers });
    return Response.json({ enabled: true, installments: !installments.error && installments.data === true, publicKey: process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY }, { headers });
  } catch { return Response.json(off, { headers }); }
}
