import type { NormalizedProductImportRow } from "@/lib/product-import/types";

type ConfirmationPreviewRow = NormalizedProductImportRow & {
  action: "create" | "update" | "unchanged" | "review" | "blocked" | "duplicate" | "error";
  rowState: "valid" | "warning" | "unchanged" | "review" | "blocked" | "duplicate" | "error";
  canImport: boolean;
  excludedFromImport: boolean;
};

type ConfirmationResult = {
  created: number;
  updated: number;
  unchanged: number;
  review: number;
  omittedErrors: number;
  omittedDuplicates: number;
};

export type ProductImportConfirmationState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialProductImportConfirmationState: ProductImportConfirmationState = {
  status: "idle",
  message: null,
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la confirmación.";
}

export async function runProductImportConfirmation(
  payload: FormDataEntryValue | null,
  mode: "file" | "google",
  applyRows: (rows: NormalizedProductImportRow[]) => Promise<ConfirmationResult>,
): Promise<ProductImportConfirmationState> {
  try {
    const raw = String(payload ?? "");
    if (!raw) throw new Error("No hay una previsualización válida para importar.");

    const parsed = JSON.parse(raw) as ConfirmationPreviewRow[];
    const rows = parsed.filter(
      (row) =>
        row.canImport &&
        !row.excludedFromImport &&
        (row.action === "update" || row.action === "create"),
    );
    if (rows.length === 0) throw new Error("No hay filas válidas para importar.");

    const result = await applyRows(rows);
    const unchanged = parsed.filter((row) => row.action === "unchanged").length + result.unchanged;
    const review = parsed.filter((row) => row.action === "review").length + result.review;
    const duplicates =
      parsed.filter((row) => row.action === "duplicate").length + result.omittedDuplicates;
    const blocked = parsed.filter((row) => row.rowState === "blocked").length;
    const invalid =
      parsed.filter((row) => row.rowState === "error").length + result.omittedErrors;
    const operation = mode === "google" ? "Sincronización" : "Importación";

    return {
      status: "success",
      message: `${operation} completada: ${result.created} creado(s), ${result.updated} actualizado(s), ${unchanged} sin cambios, ${review} en revisión, ${duplicates} duplicado(s), ${blocked} bloqueado(s) y ${invalid} inválido(s).`,
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
