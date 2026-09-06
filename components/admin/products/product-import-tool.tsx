"use client";

import { useActionState } from "react";
import {
  confirmProductImport,
  previewGoogleSheetImport,
  previewProductImport,
  type ProductImportPreviewRow,
  type ProductImportPreviewState,
} from "@/app/admin/productos/importar/actions";
import { getAttributeFieldsForCategory } from "@/lib/catalog/attribute-config";

const supportedSheets = [
  "Producto Perfumes",
  "Termos y Mates",
  "Precios Productos",
];

const emptyImportPreviewState: ProductImportPreviewState = {
  ok: false,
  message: null,
  sheetName: "Producto Perfumes",
  rows: [],
  counts: {
    valid: 0,
    warnings: 0,
    errors: 0,
    create: 0,
    update: 0,
    blocked: 0,
  },
  source: "file",
};

const emptyGoogleImportPreviewState: ProductImportPreviewState = {
  ...emptyImportPreviewState,
  source: "google",
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatMoney(value: number | null) {
  return value !== null ? currencyFormatter.format(value) : "-";
}

function getAttributeSummary(row: ProductImportPreviewRow) {
  const updates = Array.isArray(row.catalogAttributeUpdates)
    ? row.catalogAttributeUpdates
    : [];
  const fields = getAttributeFieldsForCategory(row.categorySlug);

  return updates.map((update) => {
    const field = fields.find((item) => item.key === update.key);
    const values = update.values.map((value) => {
      if (field?.input === "boolean") {
        return value === "true" ? "Sí" : "No";
      }

      return field?.options.find((item) => item.value === value)?.label ?? value;
    });

    return `${update.label}: ${values.join(", ")}`;
  });
}

function StatusBadge({ row }: { row: ProductImportPreviewRow }) {
  if (row.rowState === "blocked") {
    return (
      <span className="rounded-full border border-[#8B5E3C]/25 bg-[#8B5E3C]/10 px-3 py-1 text-xs font-semibold text-[#8B5E3C]">
        Omitido
      </span>
    );
  }

  if (row.rowState === "error") {
    return (
      <span className="rounded-full border border-[#8B5E3C]/25 bg-[#8B5E3C]/10 px-3 py-1 text-xs font-semibold text-[#8B5E3C]">
        Error
      </span>
    );
  }

  if (row.rowState === "warning") {
    return (
      <span className="rounded-full border border-[#8B5E3C]/25 bg-[#F7F4ED] px-3 py-1 text-xs font-semibold text-[#8B5E3C]">
        Advertencia
      </span>
    );
  }

  return (
    <span className="rounded-full border border-[#556B2F]/25 bg-[#556B2F]/10 px-3 py-1 text-xs font-semibold text-[#556B2F]">
      Válido
    </span>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4">
      <p className="break-words text-xs font-semibold uppercase tracking-[0.1em] text-[#8B5E3C]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[#1F1F1F]">{value}</p>
    </div>
  );
}

function SheetSelect({
  name = "sheetName",
  defaultValue,
  label,
}: {
  name?: string;
  defaultValue: string;
  label: string;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
      >
        {supportedSheets.map((sheet) => (
          <option key={sheet} value={sheet}>
            {sheet}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProductImportTool({
  resultMessage,
  automaticSyncConfigured = false,
}: {
  resultMessage?: string | null;
  automaticSyncConfigured?: boolean;
}) {
  const [filePreviewState, fileFormAction, isFilePending] = useActionState(
    previewProductImport,
    emptyImportPreviewState,
  );
  const [googlePreviewState, googleFormAction, isGooglePending] = useActionState(
    previewGoogleSheetImport,
    emptyGoogleImportPreviewState,
  );
  const previewState =
    googlePreviewState.message || googlePreviewState.rows.length > 0
      ? googlePreviewState
      : filePreviewState;
  const hasRows = previewState.rows.length > 0;
  const omittedRows = previewState.counts.errors + previewState.counts.blocked;
  const importableRows = previewState.rows.filter(
    (row) => row.canImport && !row.excludedFromImport,
  );
  const previewPayload = JSON.stringify(previewState.rows);
  const confirmLabel =
    previewState.source === "google"
      ? "Confirmar sincronización"
      : "Confirmar importación";

  return (
    <div className="grid gap-8">
      {resultMessage ? (
        <div className="rounded-3xl border border-[#556B2F]/20 bg-[#556B2F]/10 p-5 text-sm font-semibold text-[#556B2F]">
          {resultMessage}
        </div>
      ) : null}

      <form
        action={fileFormAction}
        className="overflow-hidden rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm sm:p-6"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.5fr)] lg:items-end">
          <label className="grid min-w-0 gap-2">
            <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
              Archivo Excel o CSV
            </span>
            <input
              name="file"
              type="file"
              accept=".xlsx,.xls,.csv"
              required
              className="min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 text-sm outline-none file:mr-4 file:rounded-full file:border-0 file:bg-[#556B2F] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#F7F4ED] focus:border-[#556B2F]"
            />
            <span className="break-words text-xs text-[#1F1F1F]/50">
              Máximo 5 MB. No se guarda el archivo, solo se lee para previsualizar.
            </span>
          </label>

          <SheetSelect
            defaultValue={filePreviewState.sheetName}
            label="Hoja a importar"
          />
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="break-words text-sm text-[#1F1F1F]/60">
            Primero previsualizá el archivo. La importación real se confirma después.
          </p>
          <button
            type="submit"
            disabled={isFilePending}
            className="rounded-full bg-[#556B2F] px-6 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFilePending ? "Leyendo archivo..." : "Previsualizar"}
          </button>
        </div>
      </form>

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-[#8B5E3C]/15" />
        <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[#8B5E3C]">
          O sincronizar desde Google Sheets
        </p>
        <div className="h-px flex-1 bg-[#8B5E3C]/15" />
      </div>

      <div className="rounded-3xl border border-[#0066CC]/20 bg-white/80 p-5 shadow-sm">
        <p className="text-sm font-semibold text-[#003B73]">
          {automaticSyncConfigured
            ? "Sincronización automática configurada"
            : "Sincronización automática pendiente de URL pública"}
        </p>
        <p className="mt-2 text-sm leading-6 text-[#102033]/65">
          La previsualización desde Google Sheets sigue disponible como respaldo y herramienta de diagnóstico.
        </p>
      </div>

      <form
        action={googleFormAction}
        className="overflow-hidden rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm sm:p-6"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(160px,0.32fr)_minmax(260px,0.5fr)] lg:items-end">
          <label className="grid min-w-0 gap-2">
            <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
              Link público del Google Sheet
            </span>
            <input
              name="sheetUrl"
              type="url"
              required
              placeholder="https://docs.google.com/spreadsheets/d/ID/edit#gid=123456789"
              className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
            />
            <span className="break-words text-xs text-[#1F1F1F]/50">
              Abrí la pestaña que querés importar y copiá el link. Si no trae gid, pegalo manualmente.
            </span>
          </label>

          <label className="grid min-w-0 gap-2">
            <span className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
              gid opcional
            </span>
            <input
              name="gid"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="123456789"
              className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <SheetSelect
            defaultValue={googlePreviewState.sheetName}
            label="Hoja lógica"
          />
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="break-words text-sm text-[#1F1F1F]/60">
            Ejemplo: https://docs.google.com/spreadsheets/d/ID/edit#gid=123456789
          </p>
          <button
            type="submit"
            disabled={isGooglePending}
            className="rounded-full bg-[#8B5E3C] px-6 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#6f4b30] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGooglePending ? "Trayendo datos..." : "Traer datos"}
          </button>
        </div>
      </form>

      <section className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
          Columnas opcionales de atributos
        </p>
        <div className="mt-4 grid gap-4 text-sm leading-6 text-[#1F1F1F]/65 lg:grid-cols-2">
          <div className="rounded-2xl bg-[#F7F4ED] p-4">
            <p className="font-semibold text-[#1F1F1F]">Perfumes</p>
            <p className="mt-1 break-words">
              Categoría comercial, Familia olfativa, Intensidad, Momento, Género y Disponible como decant.
            </p>
          </div>
          <div className="rounded-2xl bg-[#F7F4ED] p-4">
            <p className="font-semibold text-[#1F1F1F]">Mates</p>
            <p className="mt-1 break-words">
              Tipo de mate, Material, Color y Uso.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#1F1F1F]/50">
          Separá valores múltiples con coma o punto y coma. Una columna ausente o una celda vacía no modifica atributos existentes.
        </p>
      </section>

      {previewState.message ? (
        <div
          className={
            previewState.ok
              ? "rounded-3xl border border-[#556B2F]/20 bg-white/70 p-5 text-sm font-semibold text-[#556B2F]"
              : "rounded-3xl border border-[#8B5E3C]/20 bg-white/70 p-5 text-sm font-semibold text-[#8B5E3C]"
          }
        >
          <p className="break-words">{previewState.message}</p>
        </div>
      ) : null}

      {hasRows ? (
        <section className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <CountCard label="Válidos" value={previewState.counts.valid} />
            <CountCard label="Advertencias" value={previewState.counts.warnings} />
            <CountCard label="Errores" value={previewState.counts.errors} />
            <CountCard label="Crear" value={previewState.counts.create} />
            <CountCard label="Actualizar" value={previewState.counts.update} />
            <CountCard label="Omitidos" value={previewState.counts.blocked + previewState.counts.errors} />
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
                <thead className="bg-[#F7F4ED] text-xs uppercase tracking-[0.08em] text-[#8B5E3C]">
                  <tr>
                    <th className="px-4 py-4 font-semibold">Estado</th>
                    <th className="px-4 py-4 font-semibold">Producto</th>
                    <th className="px-4 py-4 font-semibold">Categoría</th>
                    <th className="px-4 py-4 font-semibold">Precio lista</th>
                    <th className="px-4 py-4 font-semibold">Efectivo/transferencia</th>
                    <th className="px-4 py-4 font-semibold">Costo</th>
                    <th className="px-4 py-4 font-semibold">Atributos</th>
                    <th className="px-4 py-4 font-semibold">Avisos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#8B5E3C]/10">
                  {previewState.rows.map((row) => (
                    <tr key={row.key} className="align-top">
                      <td className="px-4 py-4">
                        <StatusBadge row={row} />
                        <p className="mt-2 text-xs text-[#1F1F1F]/45">
                          Fila {row.rowNumber}
                        </p>
                      </td>
                      <td className="min-w-0 px-4 py-4">
                        <p className="max-w-xs break-words font-semibold text-[#1F1F1F]">
                          {row.name}
                        </p>
                        <p className="mt-1 max-w-xs break-all text-xs text-[#1F1F1F]/45">
                          {row.slug}
                        </p>
                        <p className="mt-1 text-xs text-[#1F1F1F]/45">
                          Stock inicial: {row.stock}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="break-words font-semibold">{row.categoryName}</p>
                        <p className="mt-1 break-all text-xs text-[#1F1F1F]/45">
                          {row.categorySlug}
                        </p>
                      </td>
                      <td className="px-4 py-4 font-semibold">
                        {formatMoney(row.price)}
                      </td>
                      <td className="px-4 py-4 font-semibold text-[#556B2F]">
                        {formatMoney(row.transferPrice)}
                      </td>
                      <td className="px-4 py-4">{formatMoney(row.cost)}</td>
                      <td className="px-4 py-4">
                        <div className="grid max-w-xs gap-1.5 text-xs text-[#1F1F1F]/65">
                          {getAttributeSummary(row).length > 0 ? (
                            getAttributeSummary(row).map((summary) => (
                              <p key={summary} className="break-words">
                                {summary}
                              </p>
                            ))
                          ) : (
                            <p className="text-[#1F1F1F]/40">Sin cambios</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="grid max-w-sm gap-2">
                          {row.errors.map((error) => (
                            <p
                              key={error}
                              className="break-words rounded-2xl bg-[#8B5E3C]/10 px-3 py-2 text-xs font-semibold text-[#8B5E3C]"
                            >
                              {error}
                            </p>
                          ))}
                          {row.warnings.map((warning) => (
                            <p
                              key={warning}
                              className="break-words rounded-2xl bg-[#F7F4ED] px-3 py-2 text-xs text-[#1F1F1F]/65"
                            >
                              {warning}
                            </p>
                          ))}
                          {row.errors.length === 0 && row.warnings.length === 0 ? (
                            <p className="text-xs text-[#1F1F1F]/45">Sin avisos</p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <form action={confirmProductImport} className="flex flex-col gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between">
            <input type="hidden" name="previewPayload" value={previewPayload} />
            <p className="break-words text-sm text-[#1F1F1F]/60">
              {importableRows.length === 0
                ? "No hay filas válidas para importar. Corregí el Sheet o cambiá la hoja."
                : omittedRows > 0
                  ? "Hay filas omitidas por errores o productos restringidos. Podés importar las filas válidas."
                  : previewState.source === "google"
                    ? "Las filas con advertencias se pueden sincronizar. Revisalas antes de confirmar."
                    : "Las filas con advertencias se pueden importar. Revisalas antes de confirmar."}
            </p>
            <button
              type="submit"
              disabled={importableRows.length === 0}
              className="rounded-full bg-[#1F1F1F] px-6 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#556B2F] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}





