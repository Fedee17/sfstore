"use client";

import imageCompression from "browser-image-compression";
import { useState, type ChangeEvent } from "react";
import {
  deleteProductImage,
  setPrimaryProductImage,
} from "@/app/admin/productos/actions";
import type { AdminCategory, AdminProduct } from "@/services/admin";

type ProductFormProps = {
  action: (formData: FormData) => Promise<void>;
  categories: AdminCategory[];
  product?: AdminProduct;
  submitLabel: string;
};

const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getOptimizedFileName(fileName: string, extension: "webp" | "jpg") {
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const safeName = nameWithoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeName || "producto"}-optimizada.${extension}`;
}

function replaceSelectedFiles(input: HTMLInputElement, files: File[]) {
  const dataTransfer = new DataTransfer();

  for (const file of files) {
    dataTransfer.items.add(file);
  }

  input.files = dataTransfer.files;
}

async function optimizeProductImage(file: File) {
  try {
    const compressedWebp = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      initialQuality: 0.8,
      fileType: "image/webp",
    });

    return new File(
      [compressedWebp],
      getOptimizedFileName(file.name, "webp"),
      {
        type: "image/webp",
        lastModified: Date.now(),
      },
    );
  } catch {
    const compressedJpeg = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      initialQuality: 0.8,
      fileType: "image/jpeg",
    });

    return new File(
      [compressedJpeg],
      getOptimizedFileName(file.name, "jpg"),
      {
        type: "image/jpeg",
        lastModified: Date.now(),
      },
    );
  }
}

function getAttribute(product: AdminProduct | undefined, name: string) {
  return (
    product?.product_attributes?.find((attribute) => attribute.name === name)
      ?.value ?? ""
  );
}

function getSortedImages(product: AdminProduct | undefined) {
  return [...(product?.product_images ?? [])].sort((first, second) => {
    if (first.is_primary && !second.is_primary) {
      return -1;
    }

    if (!first.is_primary && second.is_primary) {
      return 1;
    }

    return first.sort_order - second.sort_order;
  });
}

function ProductImageGalleryAdmin({ product }: { product: AdminProduct }) {
  const images = getSortedImages(product);
  const returnTo = `/admin/productos/${product.id}/editar`;

  return (
    <section className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-6 shadow-sm">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8B5E3C]">
            Galeria del producto
          </p>
          <h2 className="mt-2 break-words text-2xl font-semibold text-[#1F1F1F]">
            Imagenes actuales
          </h2>
        </div>
        <p className="max-w-md break-words text-sm text-[#1F1F1F]/60">
          La imagen marcada como principal se usa en catalogo, destacados y como primera imagen de la ficha.
        </p>
      </div>

      {images.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#8B5E3C]/25 bg-[#F7F4ED] p-6 text-sm text-[#1F1F1F]/60">
          Este producto todavia no tiene imagenes cargadas.
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <article
              key={image.id}
              className="min-w-0 overflow-hidden rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED]"
            >
              <div className="aspect-[4/3] overflow-hidden bg-[#1F1F1F]">
                <img
                  src={image.url}
                  alt={image.alt ?? product.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="grid min-w-0 gap-3 p-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      image.is_primary
                        ? "bg-[#556B2F] text-[#F7F4ED]"
                        : "bg-white/80 text-[#1F1F1F]/60"
                    }`}
                  >
                    {image.is_primary ? "Principal" : "Galeria"}
                  </span>
                  <span className="text-xs font-semibold text-[#1F1F1F]/45">
                    Orden {image.sort_order}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {!image.is_primary ? (
                    <form action={setPrimaryProductImage}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="imageId" value={image.id} />
                      <input type="hidden" name="slug" value={product.slug} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="w-full rounded-full bg-[#556B2F] px-4 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826]"
                      >
                        Hacer principal
                      </button>
                    </form>
                  ) : (
                    <div className="rounded-full border border-[#556B2F]/20 px-4 py-2 text-center text-sm font-semibold text-[#556B2F]">
                      En uso
                    </div>
                  )}

                  <form action={deleteProductImage}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <input type="hidden" name="slug" value={product.slug} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button
                      type="submit"
                      className="w-full rounded-full border border-[#8B5E3C]/35 px-4 py-2 text-sm font-semibold text-[#8B5E3C] transition hover:border-[#8B5E3C] hover:bg-white/80"
                    >
                      Eliminar
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductForm({
  action,
  categories,
  product,
  submitLabel,
}: ProductFormProps) {
  const [imageStatus, setImageStatus] = useState("");
  const [isOptimizingImage, setIsOptimizingImage] = useState(false);

  async function handleProductImagesChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);

    if (files.length === 0) {
      setImageStatus("");
      return;
    }

    const invalidFile = files.find((file) => !file.type.startsWith("image/"));

    if (invalidFile) {
      setImageStatus("Selecciona solo imagenes validas.");
      return;
    }

    setIsOptimizingImage(true);
    setImageStatus(
      `Optimizando ${files.length} imagen${files.length === 1 ? "" : "es"}...`,
    );

    try {
      const optimizedFiles = [];

      for (const file of files) {
        optimizedFiles.push(await optimizeProductImage(file));
      }

      replaceSelectedFiles(input, optimizedFiles);

      const originalSize = files.reduce((total, file) => total + file.size, 0);
      const optimizedSize = optimizedFiles.reduce(
        (total, file) => total + file.size,
        0,
      );

      setImageStatus(
        `Imagenes optimizadas: ${formatFileSize(originalSize)} -> ${formatFileSize(
          optimizedSize,
        )}.`,
      );
    } catch (error) {
      console.warn("[product-image-compression] No se pudieron optimizar imagenes", {
        fileCount: files.length,
        error: error instanceof Error ? error.message : "unknown",
      });
      setImageStatus(
        "No se pudieron optimizar automaticamente. Se enviaran los archivos originales.",
      );
    } finally {
      setIsOptimizingImage(false);
    }
  }

  return (
    <>
      {product ? <ProductImageGalleryAdmin product={product} /> : null}

      <form
        action={action}
        className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-6 shadow-sm"
      >
        {product ? <input type="hidden" name="productId" value={product.id} /> : null}

        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Categoria</span>
            <select
              name="categoryId"
              required
              defaultValue={product?.category_id ?? ""}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            >
              <option value="">Seleccionar categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Estado</span>
            <select
              name="status"
              defaultValue={product?.status ?? "draft"}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            >
              {PRODUCT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Nombre</span>
            <input
              name="name"
              required
              defaultValue={product?.name ?? ""}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Slug</span>
            <input
              name="slug"
              defaultValue={product?.slug ?? ""}
              placeholder="Se genera automatico si queda vacio"
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Descripcion corta</span>
            <input
              name="shortDescription"
              defaultValue={product?.short_description ?? ""}
              placeholder="Si queda vacia, se genera automaticamente"
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Descripcion</span>
            <textarea
              name="description"
              defaultValue={product?.description ?? ""}
              placeholder="Si queda vacia, se genera una descripcion comercial editable"
              rows={5}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Precio lista</span>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={product?.price ?? 0}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Precio especial transferencia/efectivo</span>
            <input
              name="transferPrice"
              type="number"
              min="0"
              step="0.01"
              defaultValue={product?.transfer_price ?? ""}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Stock</span>
            <input
              name="stock"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={product?.stock ?? 0}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Costo</span>
            <input
              name="cost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={product?.cost ?? ""}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">SKU</span>
            <input
              name="sku"
              defaultValue={product?.sku ?? ""}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Marca</span>
            <input
              name="brand"
              defaultValue={getAttribute(product, "Marca")}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Tipo</span>
            <input
              name="type"
              defaultValue={getAttribute(product, "Tipo")}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3">
            <input
              name="featured"
              type="checkbox"
              defaultChecked={product?.featured ?? false}
            />
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Destacado</span>
          </label>

          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Agregar imagenes</span>
            <input
              name="productImages"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleProductImagesChange}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 text-sm outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-[#556B2F] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#F7F4ED] focus:border-[#556B2F]"
            />
            {imageStatus ? (
              <span className="text-xs font-semibold text-[#556B2F]">
                {imageStatus}
              </span>
            ) : null}
            <span className="text-xs text-[#1F1F1F]/55">
              Sube JPG, PNG o WebP. Se optimizan automaticamente a 1200px y menor peso antes de guardar.
            </span>
          </label>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={isOptimizingImage}
            className="rounded-full bg-[#556B2F] px-6 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isOptimizingImage ? "Optimizando imagenes..." : submitLabel}
          </button>
          <a
            href="/admin/productos"
            className="rounded-full border border-[#8B5E3C]/35 px-6 py-3 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#8B5E3C] hover:bg-[#F7F4ED]"
          >
            Cancelar
          </a>
        </div>
      </form>
    </>
  );
}

