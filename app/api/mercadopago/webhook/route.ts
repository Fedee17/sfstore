// Permanently closed in the manual-payment checkout. No SDK, body parsing or DB access.
function disabled() {
  return Response.json({ code: "AUTOMATIC_PAYMENTS_DISABLED", error: "Los pagos automáticos no están habilitados." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
export function GET() { return disabled(); }
export function POST() { return disabled(); }
