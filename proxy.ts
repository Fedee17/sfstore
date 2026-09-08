import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.next();

  const path = request.nextUrl.pathname;
  const operationalRoute = ["/admin", "/checkout", "/api"].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  // Block Server Actions as well as integration endpoints before their handlers run.
  if (operationalRoute || !["GET", "HEAD"].includes(request.method)) {
    return new NextResponse(
      "Preview de consulta: administracion, pedidos, pagos e integraciones deshabilitados. Volve al catalogo para continuar.",
      {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
