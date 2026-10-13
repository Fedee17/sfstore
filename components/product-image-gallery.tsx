"use client";

import { useState } from "react";

type ProductGalleryImage = {
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
};

type ProductImageGalleryProps = {
  images?: ProductGalleryImage[];
  placeholder: string;
  productName: string;
};

function sortImages(images: ProductGalleryImage[]) {
  return [...images].sort((first, second) => {
    if (first.is_primary && !second.is_primary) {
      return -1;
    }

    if (!first.is_primary && second.is_primary) {
      return 1;
    }

    return first.sort_order - second.sort_order;
  });
}

export function ProductImageGallery({
  images = [],
  placeholder,
  productName,
}: ProductImageGalleryProps) {
  const sortedImages = sortImages(images).filter((image) => image.url);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const activeIndex = sortedImages[selectedIndex] ? selectedIndex : 0;
  const selectedImage = sortedImages[activeIndex] ?? null;

  if (!selectedImage) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center bg-[#102033] text-[#F7F9FC]" role="img" aria-label={`Imagen no disponible de ${productName}`}>
        <span className="break-all px-4 text-center text-7xl font-semibold tracking-wide text-[#DCE3EA] sm:text-8xl">
          {placeholder}
        </span>
        <span className="mt-3 text-sm">Imagen no disponible</span>
      </div>
    );
  }

  return (
    <div className="min-w-0 bg-[#102033]">
      <div className="aspect-square overflow-hidden">
        {failedImages[selectedImage.url] ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center text-[#F7F9FC]" role="img" aria-label={`Imagen no disponible de ${productName}`}>
            <span className="text-5xl font-semibold">{placeholder}</span>
            <span className="mt-3 text-sm">Imagen no disponible. Probá otra foto.</span>
          </div>
        ) : (
          <img
            src={selectedImage.url}
            ref={(image) => {
              if (image?.complete && image.naturalWidth === 0) {
                setFailedImages((current) => ({ ...current, [selectedImage.url]: true }));
              }
            }}
            alt={selectedImage.alt ?? productName}
            className="h-full w-full object-contain"
            onError={() => setFailedImages((current) => ({ ...current, [selectedImage.url]: true }))}
          />
        )}
      </div>

      {sortedImages.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 border-t border-[#F7F9FC]/10 bg-[#102033] p-3 sm:grid-cols-5">
          {sortedImages.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`aspect-square min-w-0 overflow-hidden rounded-2xl border transition ${
                index === activeIndex
                  ? "border-[#0072CE] opacity-100"
                  : "border-[#F7F9FC]/15 opacity-70 hover:opacity-100"
              }`}
              aria-label={`Ver imagen ${index + 1} de ${productName}`}
              aria-pressed={index === activeIndex}
            >
              <img
                src={image.url}
                alt={image.alt ?? productName}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}


