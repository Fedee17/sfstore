import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// Refresh guest cookies before Server Components, which cannot persist rotation.
// This never creates identities, trusts incoming identity headers or authorizes a read.
export async function proxy(request: NextRequest) {
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
      values.forEach(({name,value,options})=>response.cookies.set(name,value,{...options,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"}));
      response.headers.set("Cache-Control","private, no-store");
    } },
  });
  try { await auth.auth.getUser(); } catch { /* Readers still verify identity and fail closed. */ }
  response.headers.set("Cache-Control","private, no-store");
  return response;
}
export const config = { matcher:"/checkout/:path*" };
