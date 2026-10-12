import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseAuthServerClient(options: { checkout?: boolean; writable?: boolean } = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }

  if (!supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    ...(options.checkout ? { cookieOptions: { name: "sfstore-checkout-auth", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(name, value, { ...cookieOptions, ...(options.checkout ? { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } : {}) });
          });
        } catch (error) {
          if (options.writable) throw error;
          // Server Components cannot always write cookies. Server Actions can.
        }
      },
    },
  });
}

export async function hasCheckoutSessionCookie() {
  const store = await cookies();
  return store.getAll().some(({ name, value }) => !!value && (name === "sfstore-checkout-auth" || name.startsWith("sfstore-checkout-auth.")));
}
