import { AdminNav } from "@/components/admin/admin-nav";
import { ProductImportTool } from "@/components/admin/products/product-import-tool";
import { requireAdminSession } from "@/lib/admin-session";

type ImportPageSearchParams = Record<string, string | string[] | undefined>;

type ImportPageProps = {
  searchParams?: Promise<ImportPageSearchParams>;
};

function getParam(params: ImportPageSearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminProductImportPage({
  searchParams,
}: ImportPageProps) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  const created = getParam(params, "created");
  const updated = getParam(params, "updated");
  const errors = getParam(params, "errors");
  const blocked = getParam(params, "blocked");
  const duplicates = getParam(params, "duplicates");
  const resultMessage =
    created || updated || errors || blocked || duplicates
      ? `Importación completada: ${created || "0"} producto(s) creado(s), ${updated || "0"} actualizado(s), ${errors || "0"} omitido(s) por error y ${blocked || "0"} bloqueado(s) y ${duplicates || "0"} duplicado(s).`
      : null;

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="flex min-w-0 flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
              Admin
            </p>
            <h1 className="mt-3 break-words text-4xl font-semibold">
              Importar productos
            </h1>
            <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-[#1F1F1F]/60">
              Subí el Excel de SFSTORE, elegí una hoja y revisá la previsualización antes de guardar cambios en Supabase.
            </p>
          </div>
          <a
            href="/admin/productos"
            className="w-full rounded-full border border-[#8B5E3C]/30 px-6 py-3 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#556B2F] hover:text-[#556B2F] sm:w-auto"
          >
            Volver a productos
          </a>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <aside className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-6 shadow-sm">
            <h2 className="break-words text-xl font-semibold">Hojas soportadas</h2>
            <div className="mt-5 grid gap-3 text-sm text-[#1F1F1F]/65">
              <p className="break-words rounded-2xl bg-[#F7F4ED] p-4">
                <strong className="text-[#1F1F1F]">Producto Perfumes:</strong> producto, costo, precio lista, precio especial y proveedor.
              </p>
              <p className="break-words rounded-2xl bg-[#F7F4ED] p-4">
                <strong className="text-[#1F1F1F]">Termos y Mates:</strong> detecta mates, termos, bombillas y accesorios por nombre.
              </p>
              <p className="break-words rounded-2xl bg-[#F7F4ED] p-4">
                <strong className="text-[#1F1F1F]">Precios Productos:</strong> toma precio lista, precio efectivo/transferencia y costo.
              </p>
            </div>
            <p className="mt-5 break-words text-xs leading-5 text-[#1F1F1F]/50">
              Las hojas de proveedores, compras y ventas no se importan automáticamente. No se borran ni archivan productos que no estén en el archivo.
            </p>
          </aside>

          <ProductImportTool resultMessage={resultMessage} />
        </div>
      </section>
    </main>
  );
}




