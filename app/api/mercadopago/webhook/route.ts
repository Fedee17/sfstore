import { handleWebhook } from "@/lib/payments/mercadopago-handlers";
import { mercadoPagoDeps } from "@/services/mercadopago-server";

// Signed Mercado Pago notifications. The payment is re-read from Mercado Pago and settled by the database.
export async function POST(request: Request) {
  return handleWebhook(request, mercadoPagoDeps());
}
