import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedAdminEmail } from "@/lib/admin-authorization";

const ADMIN_LOGIN_PATH = "/admin/login";

function secureCookie(options: object) {
  return { ...options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
}

// Fail-closed gate for /admin: every page and Server Function still verifies the
// session itself; this only guarantees that a new route cannot ship unprotected.
async function guardAdmin(request: NextRequest, pathname: string) {
  const toLogin = () => NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (pathname === ADMIN_LOGIN_PATH) return NextResponse.next({ request });
  if (!url || !key) return toLogin();
  let response = NextResponse.next({ request });
  const auth = createServerClient(url, key, {
    cookies: { getAll: () => request.cookies.getAll(), setAll(values) {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, secureCookie(options)));
    } },
  });
  try {
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user || user.is_anonymous || !isAllowedAdminEmail(user.email, process.env.ADMIN_ALLOWED_EMAILS)) return toLogin();
  } catch {
    return toLogin();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Refresh guest cookies before Server Components, which cannot persist rotation.
// This never creates identities, trusts incoming identity headers or authorizes a read.
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl?.pathname ?? "";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return guardAdmin(request, pathname);
  let response = NextResponse.next({ request });
  if (!request.cookies.getAll().some(({name,value})=>!!value && (name === "sfstore-checkout-auth" || name.startsWith("sfstore-checkout-auth.")))) return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const auth = createServerClient(url,key,{
    cookieOptions:{name:"sfstore-checkout-auth",httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"},
    cookies:{ getAll:()=>request.cookies.getAll(),setAll(values){
      values.forEach(({name,value})=>request.cookies.set(name,value));
      const previous = response.cookies.getAll();
      response = NextResponse.next({request});
      previous.forEach(cookie=>response.cookies.set(cookie));
      values.forEach(({name,value,options})=>response.cookies.set(name,value,secureCookie(options)));
      response.headers.set("Cache-Control","private, no-store");
    } },
  });
  try { await auth.auth.getUser(); } catch { /* Readers still verify identity and fail closed. */ }
  response.headers.set("Cache-Control","private, no-store");
  return response;
}
export const config = { matcher: ["/checkout/:path*", "/admin/:path*"] };
