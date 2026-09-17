import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import {
  isAllowedAdminEmail,
  parseAllowedAdminEmails,
} from "@/lib/admin-authorization";
import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export function getAllowedAdminEmails() {
  return parseAllowedAdminEmails(process.env.ADMIN_ALLOWED_EMAILS);
}

export function isAllowedAdminUser(user: User) {
  return isAllowedAdminEmail(
    user.email,
    process.env.ADMIN_ALLOWED_EMAILS,
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
