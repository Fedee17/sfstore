import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export function getAllowedAdminEmails() {
  const rawEmails =
    process.env.ADMIN_ALLOWED_EMAILS ?? process.env.ADMIN_EMAIL ?? "";

  return rawEmails
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedAdminUser(user: User) {
  const allowedEmails = getAllowedAdminEmails();

  // TODO: configurar ADMIN_ALLOWED_EMAILS con el email del dueño antes de producción.
  if (allowedEmails.length === 0) {
    return true;
  }

  return Boolean(
    user.email && allowedEmails.includes(user.email.trim().toLowerCase()),
  );
}

export async function getAdminUser() {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  if (!isAllowedAdminUser(user)) {
    return null;
  }

  return user;
}

export async function requireAdminSession() {
  const user = await getAdminUser();

  if (!user) {
    redirect("/admin/login");
  }

  return user;
}

export async function requireAdminActionSession() {
  const user = await getAdminUser();

  if (!user) {
    throw new Error("Acceso denegado.");
  }

  return user;
}
