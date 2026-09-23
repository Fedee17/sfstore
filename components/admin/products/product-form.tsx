"use client";

import imageCompression from "browser-image-compression";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  deleteProductImage,
  moveProductImage,
  setPrimaryProductImage,
} from "@/app/admin/productos/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import {
  getAttributeFieldsForCategory,
  getCatalogAttributeInputName,
  getCatalogAttributeValues,
  type CatalogAttributeField,
} from "@/lib/catalog/attribute-config";
import { MATE_PRODUCT_TYPES, PRODUCT_ATTRIBUTE_NAMES } from "@/lib/product-taxonomy";
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

function CatalogAttributeControl({
  field,
  product,
}: {
  field: CatalogAttributeField;
  product?: AdminProduct;
}) {
  const inputName = getCatalogAttributeInputName(field.key);
  const selectedValues = getCatalogAttributeValues(
    product?.product_attributes,
    field.key,
  );

  if (field.input === "boolean") {
    return (
      <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3">
        <input
          name={inputName}
          type="checkbox"
          value="true"
          defaultChecked={selectedValues.includes("true")}
          className="h-4 w-4 accent-[#556B2F]"
        />
        <span className="text-sm font-semibold text-[#1F1F1F]/75">
          {field.label}
        </span>
      </label>
    );
  }

  if (field.input === "select") {
    return (
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[#1F1F1F]/75">
          {field.label}
        </span>
        <select
          name={inputName}
          defaultValue={selectedValues[0] ?? ""}
          className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
        >
          <option value="">Sin especificar</option>
          {field.options.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <fieldset className="min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] p-4">
      <legend className="px-1 text-sm font-semibold text-[#1F1F1F]/75">
        {field.label}
      </legend>
      <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
        {field.options.map((item) => (
          <label
            key={item.value}
            className="flex min-w-0 items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-[#1F1F1F]/75"
          >
            <input
              name={inputName}
              type="checkbox"
              value={item.value}
              defaultChecked={selectedValues.includes(item.value)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#556B2F]"
            />
            <span className="min-w-0 break-words">{item.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function getSortedImages(product: AdminProduct | undefined) {
  return [...(product?.product_images ?? [])].sort((first, second) => {
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
          {images.map((image, index) => (
            <article
              key={image.id}
              className="min-w-0 overflow-hidden rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED]"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[#1F1F1F]">
                <Image
                  src={image.url}
                  alt={image.alt ?? product.name}
                  fill
                  unoptimized
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
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
                      <PendingSubmitButton
                        pendingLabel="Guardando..."
                        className="w-full rounded-full bg-[#556B2F] px-4 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Hacer principal
                      </PendingSubmitButton>
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
                    <PendingSubmitButton
                      pendingLabel="Eliminando..."
                      className="w-full rounded-full border border-[#8B5E3C]/35 px-4 py-2 text-sm font-semibold text-[#8B5E3C] transition hover:border-[#8B5E3C] hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Eliminar
                    </PendingSubmitButton>
                  </form>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-[#8B5E3C]/15 pt-3">
                  <span className="text-xs font-semibold text-[#1F1F1F]/55">
                    Ordenar imagen
                  </span>
                  <div className="flex gap-2">
                    <form action={moveProductImage}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="imageId" value={image.id} />
                      <input type="hidden" name="direction" value="previous" />
                      <input type="hidden" name="slug" value={product.slug} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <PendingSubmitButton
                        pendingLabel="..."
                        disabled={index === 0}
                        title="Mover imagen a la izquierda"
                        aria-label="Mover imagen a la izquierda"
                        className="h-11 w-11 rounded-full border border-[#8B5E3C]/30 text-lg font-semibold text-[#8B5E3C] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        ←
                      </PendingSubmitButton>
                    </form>
                    <form action={moveProductImage}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="imageId" value={image.id} />
                      <input type="hidden" name="direction" value="next" />
                      <input type="hidden" name="slug" value={product.slug} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <PendingSubmitButton
                        pendingLabel="..."
                        disabled={index === images.length - 1}
                        title="Mover imagen a la derecha"
                        aria-label="Mover imagen a la derecha"
                        className="h-11 w-11 rounded-full border border-[#8B5E3C]/30 text-lg font-semibold text-[#8B5E3C] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        →
                      </PendingSubmitButton>
                    </form>
                  </div>
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
  const [pendingImages, setPendingImages] = useState<
    { id: string; file: File; previewUrl: string }[]
  >([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef(new Set<string>());
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    product?.category_id ?? "",
  );
  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const catalogAttributeFields = getAttributeFieldsForCategory(
    selectedCategory?.slug ?? "",
  );

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function syncPendingFiles(nextImages: { file: File }[]) {
    if (imageInputRef.current) {
      replaceSelectedFiles(
        imageInputRef.current,
        nextImages.map((image) => image.file),
      );
    }
  }

  function removePendingImage(imageId: string) {
    setPendingImages((current) => {
      const removed = current.find((image) => image.id === imageId);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrlsRef.current.delete(removed.previewUrl);
      }
      const next = current.filter((image) => image.id !== imageId);
      syncPendingFiles(next);
      setImageStatus(
        next.length === 0
          ? ""
          : `${next.length} imagen${next.length === 1 ? "" : "es"} seleccionada${next.length === 1 ? "" : "s"}.`,
      );
      return next;
    });
  }

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
      const optimizedFiles: File[] = [];

      for (const file of files) {
        try {
          optimizedFiles.push(await optimizeProductImage(file));
        } catch {
          optimizedFiles.push(file);
        }
      }

      const additions = optimizedFiles.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        previewUrlsRef.current.add(previewUrl);
        return { id: crypto.randomUUID(), file, previewUrl };
      });
      const nextImages = [...pendingImages, ...additions];
      setPendingImages(nextImages);
      replaceSelectedFiles(input, nextImages.map((image) => image.file));

      const originalSize = files.reduce((total, file) => total + file.size, 0);
      const optimizedSize = optimizedFiles.reduce(
        (total, file) => total + file.size,
        0,
      );

      setImageStatus(
        `${nextImages.length} imagen${nextImages.length === 1 ? "" : "es"} seleccionada${nextImages.length === 1 ? "" : "s"}. Ultimo lote: ${formatFileSize(originalSize)} -> ${formatFileSize(optimizedSize)}.`,
      );
    } catch (error) {
      console.warn("[product-image-compression] No se pudieron optimizar imagenes", {
        fileCount: files.length,
        error: error instanceof Error ? error.message : "unknown",
      });
      setImageStatus("No se pudieron preparar las imagenes. Volve a seleccionarlas.");
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
              value={selectedCategoryId}
              onChange={(event) => setSelectedCategoryId(event.target.value)}
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

          <div className="grid gap-2 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] px-4 py-3">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">
              Stock actual
            </span>
            <span className="font-semibold">{product?.stock ?? 0}</span>
            <span className="text-xs leading-5 text-[#1F1F1F]/55">
              {product
                ? "El saldo se modifica mediante un ajuste auditable desde Productos."
                : "El producto se creara con stock inicial 0."}
            </span>
            {product ? (
              <Link
                href={`/admin/inventario?product=${product.id}`}
                className="text-xs font-semibold text-[#556B2F] underline-offset-4 hover:underline"
              >
                Ver movimientos
              </Link>
            ) : null}
          </div>

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
              defaultValue={getAttribute(product, PRODUCT_ATTRIBUTE_NAMES.brand)}
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Tipo</span>
            <input
              name="type"
              list="mate-product-types"
              defaultValue={getAttribute(product, PRODUCT_ATTRIBUTE_NAMES.type)}
              placeholder="Ej: Mate, Termo, Bombilla"
              className="rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3 outline-none transition focus:border-[#556B2F]"
            />
            <datalist id="mate-product-types">
              {MATE_PRODUCT_TYPES.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </label>

          {catalogAttributeFields.length > 0 ? (
            <section
              key={selectedCategory?.slug}
              className="grid min-w-0 gap-5 rounded-2xl border border-[#556B2F]/20 bg-white/65 p-5 md:col-span-2 md:grid-cols-2"
            >
              <div className="min-w-0 md:col-span-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#556B2F]">
                  Atributos del catálogo
                </p>
                <h2 className="mt-1 break-words text-xl font-semibold text-[#1F1F1F]">
                  {selectedCategory?.slug === "perfumes"
                    ? "Características del perfume"
                    : "Características del mate"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#1F1F1F]/60">
                  Estos datos alimentan los filtros públicos. Podés seleccionar más de una opción cuando corresponda.
                </p>
              </div>
              {catalogAttributeFields.map((field) => (
                <CatalogAttributeControl
                  key={field.key}
                  field={field}
                  product={product}
                />
              ))}
            </section>
          ) : null}

          <label className="flex items-center gap-3 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 py-3">
            <input
              name="featured"
              type="checkbox"
              defaultChecked={product?.featured ?? false}
            />
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Destacado</span>
          </label>

          <div className="grid gap-3 md:col-span-2">
            <span className="text-sm font-semibold text-[#1F1F1F]/75">Agregar imagenes</span>
            <input
              ref={imageInputRef}
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
            {pendingImages.length > 0 ? (
              <section className="grid min-w-0 gap-3 rounded-2xl border border-[#556B2F]/20 bg-[#F7F4ED] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#1F1F1F]">Nuevas imagenes</h3>
                  <span className="text-xs font-semibold text-[#556B2F]">
                    {pendingImages.length} imagen{pendingImages.length === 1 ? "" : "es"} seleccionada{pendingImages.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {pendingImages.map((image, index) => (
                    <article key={image.id} className="min-w-0 overflow-hidden rounded-xl border border-[#8B5E3C]/15 bg-white">
                      <div className="relative aspect-square overflow-hidden bg-[#1F1F1F]">
                        <Image src={image.previewUrl} alt={`Vista previa ${index + 1}`} fill unoptimized sizes="(min-width: 1024px) 25vw, 50vw" className="h-full w-full object-cover" />
                      </div>
                      <div className="grid gap-2 p-3">
                        <p className="truncate text-xs font-semibold text-[#1F1F1F]/70" title={image.file.name}>{image.file.name}</p>
                        <button
                          type="button"
                          onClick={() => removePendingImage(image.id)}
                          className="min-h-11 rounded-full border border-[#8B5E3C]/30 px-3 text-xs font-semibold text-[#8B5E3C] transition hover:bg-[#8B5E3C]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
                        >
                          Quitar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PendingSubmitButton
            pendingLabel={pendingImages.length > 0 ? "Subiendo imagenes..." : "Guardando..."}
            disabled={isOptimizingImage}
            className="rounded-full bg-[#556B2F] px-6 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isOptimizingImage ? "Optimizando imagenes..." : submitLabel}
          </PendingSubmitButton>
          <Link
            href="/admin/productos"
            className="rounded-full border border-[#8B5E3C]/35 px-6 py-3 text-center text-sm font-semibold text-[#8B5E3C] transition hover:border-[#8B5E3C] hover:bg-[#F7F4ED]"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </>
  );
}

