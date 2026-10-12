"use server";

import { redirect } from "next/navigation";

import { isAllowedAdminUser } from "@/lib/admin-session";
import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

function getLoginErrorUrl(message: string) {
  return `/admin/login?error=${encodeURIComponent(message)}`;
}

function getSupabaseEnvError() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return "Falta configurar NEXT_PUBLIC_SUPABASE_URL.";
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return "Falta configurar NEXT_PUBLIC_SUPABASE_ANON_KEY.";
  }

  return null;
}

function getAuthErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  return "code" in error && typeof error.code === "string" ? error.code : null;
}

function getAuthErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  return "status" in error && typeof error.status === "number"
    ? error.status
    : null;
}

function getAuthErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  return "message" in error && typeof error.message === "string"
    ? error.message
    : "";
}

function getPublicAuthErrorMessage(error: unknown) {
  const code = getAuthErrorCode(error);
  const message = getAuthErrorMessage(error).toLowerCase();

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "El usuario existe, pero el email todavía no está confirmado en Supabase.";
  }

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "Email o contraseña incorrectos.";
  }

  return "No se pudo iniciar sesión. Revisá la configuración de Supabase Auth.";
}

export async function loginAdmin(formData: FormData) {
  const emailEntry = formData.get("email");
  const passwordEntry = formData.get("password");
  const email = String(emailEntry ?? "").trim().toLowerCase();
  const password = typeof passwordEntry === "string" ? passwordEntry : "";
  if (!email || !password) {
    redirect(getLoginErrorUrl("Ingresa email y contraseña."));
  }

  const envError = getSupabaseEnvError();

  if (envError) {
    console.error("[admin-login] Configuración Supabase incompleta", {
      missingUrl: !process.env.NEXT_PUBLIC_SUPABASE_URL,
      missingAnonKey: !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasAdminAllowedEmails: Boolean(process.env.ADMIN_ALLOWED_EMAILS),
    });
    redirect(getLoginErrorUrl(envError));
  }

  // Usa el cliente SSR de Supabase Auth con anon key. No usa service role.
  const supabase = await getSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const code = getAuthErrorCode(error);
    const diagnosticCode = [
      "invalid_credentials",
      "email_not_confirmed",
      "over_request_rate_limit",
      "unexpected_failure",
      "request_timeout",
    ].includes(code ?? "") ? code : "other_auth_error";

    console.warn("[admin-login] Supabase rechazó el login", {
      code: diagnosticCode,
      status: getAuthErrorStatus(error),
    });
    redirect(getLoginErrorUrl(getPublicAuthErrorMessage(error)));
  }

  if (!data.user) {
    console.warn("[admin-login] Login sin usuario devuelto por Supabase");
    redirect(getLoginErrorUrl("Supabase no devolvió un usuario para esta sesión."));
  }

  if (!isAllowedAdminUser(data.user)) {
    console.warn("[admin-login] Usuario autenticado no autorizado para admin");
    await supabase.auth.signOut();
    redirect(
      getLoginErrorUrl(
        "El email autenticado no está incluido en ADMIN_ALLOWED_EMAILS.",
      ),
    );
  }

  console.info("[admin-login] Login admin correcto");
  redirect("/admin");
}

export async function logoutAdmin() {
  const supabase = await getSupabaseAuthServerClient();
  await supabase.auth.signOut();

  redirect("/admin/login");
}
