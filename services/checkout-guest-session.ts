import "server-only";
import { getSupabaseAuthServerClient, hasCheckoutSessionCookie } from "@/lib/supabase/auth-server";
import { CheckoutError, isUuid } from "@/lib/checkout/contract";

export async function ensureCheckoutGuestSession(input: { captchaToken?: string; hasPendingOperation: boolean }) {
  const auth = await getSupabaseAuthServerClient({ checkout: true, writable: true });
  const current = await auth.auth.getUser();
  if (!current.error && current.data.user && isUuid(current.data.user.id)) return { ready: true };
  if (current.error && current.error.name !== "AuthSessionMissingError" && !(await hasCheckoutSessionCookie())) throw new CheckoutError("CHECKOUT_SESSION_UNAVAILABLE",503);
  if (await hasCheckoutSessionCookie()) throw new CheckoutError("CHECKOUT_SESSION_LOST",409);
  // Preserve existing authenticated buyers and their pending operations.
  const legacy = await getSupabaseAuthServerClient({ writable: true });
  const previous = await legacy.auth.getUser();
  if (!previous.error && previous.data.user && isUuid(previous.data.user.id)) return { ready: true };
  if (previous.error && previous.error.name !== "AuthSessionMissingError") throw new CheckoutError("CHECKOUT_SESSION_UNAVAILABLE",503);
  if (input.hasPendingOperation) throw new CheckoutError("CHECKOUT_SESSION_LOST",409);
  if (process.env.CHECKOUT_GUEST_ENABLED !== "true") throw new CheckoutError("CHECKOUT_GUEST_NOT_CONFIGURED",503);
  if (process.env.NODE_ENV === "production" && !input.captchaToken) throw new CheckoutError("CHECKOUT_CAPTCHA_REQUIRED",400);
  const created = await auth.auth.signInAnonymously({ options: { captchaToken: input.captchaToken } });
  if (created.error || !created.data.user) throw new CheckoutError("CHECKOUT_SESSION_UNAVAILABLE",503);
  const verified = await auth.auth.getUser();
  if (verified.error || !verified.data.user?.is_anonymous || !isUuid(verified.data.user.id) || verified.data.user.id !== created.data.user.id
    || !(await hasCheckoutSessionCookie())) throw new CheckoutError("CHECKOUT_SESSION_UNAVAILABLE",503);
  // Neither identity nor Auth tokens belong in the HTTP response.
  return { ready: true };
}
