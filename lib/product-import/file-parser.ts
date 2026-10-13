import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/uploads/limits";
const mimeTypes = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "application/csv", "text/plain", ""]);
let parsing = false;
export async function parseProductImportFile(file: File, sheetName: string): Promise<Record<string, unknown>[]> {
  if (!file.size) throw new Error("Subí un archivo .xlsx, .xls o .csv para previsualizar.");
  if (file.size > MAX_UPLOAD_FILE_BYTES) throw new Error("El archivo supera el límite de 3 MiB.");
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (!["xlsx", "xls", "csv"].includes(extension ?? "")) throw new Error("Formato inválido. Usá .xlsx, .xls o .csv.");
  if (!mimeTypes.has(file.type)) throw new Error("Tipo de archivo inválido para importación.");
  if (parsing) throw new Error("Ya se está procesando un archivo. Reintentá en unos segundos.");
  parsing = true;
  try {
    const bytes = await file.arrayBuffer();
    return await new Promise((resolve, reject) => {
      const worker = new Worker(join(process.cwd(), "lib/product-import/parser-worker.mjs"), {
        workerData: { bytes, extension, sheetName },
        transferList: [bytes], env: {},
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      });
      let settled = false;
      const finish = async (rows?: Record<string, unknown>[], error?: Error) => {
        if (settled) return; settled = true; clearTimeout(timer);
        await worker.terminate();
        if (error) reject(error); else resolve(rows ?? []);
      };
      const timer = setTimeout(() => { void finish(undefined, new Error("El archivo excede el tiempo de procesamiento. Reducí su tamaño o dividilo en tandas.")); }, 5000);
      worker.once("message", (message) => { void finish(message.rows, message.error ? new Error(message.error) : undefined); });
      worker.once("error", () => { void finish(undefined, new Error("El archivo supera los recursos permitidos o no se pudo procesar.")); });
      worker.once("exit", () => { if (!settled) void finish(undefined, new Error("No se pudo procesar el archivo dentro de los recursos permitidos.")); });
    });
  } finally { parsing = false; }
}
