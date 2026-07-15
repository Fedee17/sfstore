"use server";

import { redirect } from "next/navigation";

import {
  getAllowedAdminEmails,
  isAllowedAdminUser,
} from "@/lib/admin-session";
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

function getAuthErrorName(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  return "name" in error && typeof error.name === "string" ? error.name : null;
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

function logLoginDebug(context: Record<string, unknown>) {
  // TEMP DEBUG: remover cuando el login admin quede confirmado.
  console.info("[admin-login-debug]", context);
}

export async function loginAdmin(formData: FormData) {
  const emailEntry = formData.get("email");
  const passwordEntry = formData.get("password");
  const email = String(emailEntry ?? "").trim().toLowerCase();
  const password = typeof passwordEntry === "string" ? passwordEntry : "";
  const allowedEmails = getAllowedAdminEmails();

  logLoginDebug({
    step: "form-data",
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasAdminAllowedEmails: Boolean(process.env.ADMIN_ALLOWED_EMAILS),
    normalizedEmail: email,
    allowedEmails,
    emailEntryType: typeof emailEntry,
    passwordEntryType: typeof passwordEntry,
    passwordProvided: password.length > 0,
  });

  if (!email || !password) {
    redirect(getLoginErrorUrl("Ingresa email y contraseña."));
  }

  const envError = getSupabaseEnvError();

  if (envError) {
    console.error("[admin-login] Configuración Supabase incompleta", {
      email,
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
    const authDetails = {
      code: getAuthErrorCode(error),
      status: getAuthErrorStatus(error),
      name: getAuthErrorName(error),
      message: getAuthErrorMessage(error),
    };

    console.warn("[admin-login] Supabase rechazó el login", {
      email,
      ...authDetails,
    });
    logLoginDebug({
      step: "supabase-auth-error",
      normalizedEmail: email,
      allowedEmails,
      ...authDetails,
    });
    redirect(getLoginErrorUrl(getPublicAuthErrorMessage(error)));
  }

  logLoginDebug({
    step: "supabase-auth-success",
    normalizedEmail: email,
    returnedUserEmail: data.user?.email?.trim().toLowerCase() ?? null,
    hasSession: Boolean(data.session),
    allowedEmails,
  });

  if (!data.user) {
    console.warn("[admin-login] Login sin usuario devuelto por Supabase", {
      email,
    });
    redirect(getLoginErrorUrl("Supabase no devolvió un usuario para esta sesión."));
  }

  if (!isAllowedAdminUser(data.user)) {
    const returnedEmail = data.user.email?.trim().toLowerCase() ?? email;

    console.warn("[admin-login] Usuario autenticado no autorizado para admin", {
      email: returnedEmail,
      allowedEmails,
    });
    logLoginDebug({
      step: "admin-allowed-emails-rejected",
      normalizedEmail: email,
      returnedUserEmail: returnedEmail,
      allowedEmails,
    });
    await supabase.auth.signOut();
    redirect(
      getLoginErrorUrl(
        "El email autenticado no está incluido en ADMIN_ALLOWED_EMAILS.",
      ),
    );
  }

  console.info("[admin-login] Login admin correcto", {
    email: data.user.email?.trim().toLowerCase() ?? email,
  });
  redirect("/admin");
}

export async function logoutAdmin() {
  const supabase = await getSupabaseAuthServerClient();
  await supabase.auth.signOut();

  redirect("/admin/login");
}
