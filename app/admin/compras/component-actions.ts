"use server";
import { revalidatePath } from "next/cache";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function saveComponentComposition(_state: { message: string; success: boolean }, form: FormData) {
  await requireAdminActionSession();
  const purchase = String(form.get("purchaseId") ?? ""), recipe = String(form.get("recipeId") ?? "");
  const cc = Number(form.get("cc")), lightning = Number(form.get("lightning"));
  if (![cc, lightning].every(n => Number.isSafeInteger(n) && n >= 0) || cc + lightning < 1) return { message: "Indicá cantidades enteras para cada cable.", success: false };
  const { error } = await getSupabaseAdminClient().rpc("set_component_purchase_composition", { p_purchase: purchase, p_recipe: recipe, p_cc: cc, p_lightning: lightning });
  if (error) return { message: "No se guardó la composición. La compra debe ser un borrador y los cables deben sumar los conjuntos comprados.", success: false };
  revalidatePath(`/admin/compras/${purchase}`);
  return { message: "Composición guardada. Al confirmar se recibirán cabezales y cables; el conjunto no tendrá stock propio.", success: true };
}
