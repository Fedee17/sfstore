import { createClient } from "@supabase/supabase-js";

export function getSupabaseClient() {
  if (process.env.NEXT_PUBLIC_PREVIEW_MODE === "true") {
    throw new Error("Supabase no esta disponible en Preview. Se usa el catalogo de respaldo.");
  }
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

  return createClient(supabaseUrl, supabaseAnonKey);
}
