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
  const selectedImage = sortedImages[selectedIndex] ?? sortedImages[0] ?? null;

  if (!selectedImage) {
    return (
      <div className="flex aspect-square items-center justify-center bg-[#102033] text-[#F7F9FC]">
        <span className="break-all px-4 text-center text-7xl font-semibold tracking-wide text-[#DCE3EA] sm:text-8xl">
          {placeholder}
        </span>
      </div>
    );
  }

  return (
    <div className="min-w-0 bg-[#102033]">
      <div className="aspect-square overflow-hidden">
        <img
          src={selectedImage.url}
          alt={selectedImage.alt ?? productName}
          className="h-full w-full object-cover"
        />
      </div>

      {sortedImages.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 border-t border-[#F7F9FC]/10 bg-[#102033] p-3 sm:grid-cols-5">
          {sortedImages.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`aspect-square min-w-0 overflow-hidden rounded-2xl border transition ${
                index === selectedIndex
                  ? "border-[#0072CE] opacity-100"
                  : "border-[#F7F9FC]/15 opacity-70 hover:opacity-100"
              }`}
              aria-label={`Ver imagen ${index + 1} de ${productName}`}
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


