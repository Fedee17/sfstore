// Application budgets leave room below Vercel's 4.5 MB request limit.
export const MAX_UPLOAD_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_FORM_TEXT_BYTES = 128 * 1024;
export const UPLOAD_SIZE_LABEL = "3 MiB";
export class UploadLimitError extends Error {}
export function assertUploadFormData(form: FormData) {
  let files = 0, text = 0, entries = 0;
  for (const [name, value] of form.entries()) {
    if (++entries > 128 || name.length > 256) throw new UploadLimitError("El formulario supera el límite permitido.");
    if (typeof value === "string") text += new TextEncoder().encode(value).byteLength;
    else { files += value.size; if (value.name.length > 256) throw new UploadLimitError("El nombre del archivo es demasiado largo."); }
  }
  if (files > MAX_UPLOAD_FILE_BYTES) throw new UploadLimitError("Los archivos deben sumar como máximo 3 MiB. Reducí su tamaño o cargalos en tandas.");
  if (text > MAX_FORM_TEXT_BYTES) throw new UploadLimitError("El formulario es demasiado grande. Reducí la cantidad de datos por tanda.");
}
