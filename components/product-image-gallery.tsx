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
  showThumbnails?: boolean;
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

function GalleryArrow({ direction, onClick }: {
  direction: "previous" | "next";
  onClick: () => void;
}) {
  const previous = direction === "previous";

  return (
    <button
      type="button"
      aria-label={previous ? "Foto anterior" : "Foto siguiente"}
      onClick={onClick}
      className={`absolute inset-y-0 my-auto grid size-11 place-items-center rounded-full text-[var(--boutique-olive,#444f25)] before:absolute before:inset-1.5 before:rounded-full before:bg-[#fffcf6] before:shadow-[0_1px_4px_#38291633] hover:before:bg-[#eee9d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--boutique-focus,#637134)] md:size-12 ${previous ? "left-2" : "right-2"}`}
    >
      <svg aria-hidden="true" className="relative size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={previous ? "m15 3-8 9 8 9" : "m9 3 8 9-8 9"} />
      </svg>
    </button>
  );
}

export function ProductImageGallery({
  images = [],
  placeholder,
  productName,
  showThumbnails = true,
}: ProductImageGalleryProps) {
  const sortedImages = sortImages(images).filter((image) => image.url);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  // Review 21/11 (CLS 0.17 on desktop): until a photo loads, reserve a 3:4 box (the catalog photo format) so the page does not jump.
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const activeIndex = sortedImages[selectedIndex] ? selectedIndex : 0;
  const selectedImage = sortedImages[activeIndex] ?? null;

  const imageCount = sortedImages.length;
  const hasNavigation = imageCount > 1;
  const hasThumbnails = showThumbnails && hasNavigation;
  const imageUnavailable = !selectedImage || failedImages[selectedImage.url];
  const imageLoading = !imageUnavailable && !loadedImages[selectedImage.url];

  function moveSelection(offset: number) {
    setSelectedIndex((current) => {
      const index = sortedImages[current] ? current : 0;
      return (index + offset + imageCount) % imageCount;
    });
  }

  function markImageFailed(url: string) {
    setFailedImages((current) => current[url] ? current : { ...current, [url]: true });
  }

  function markImageLoaded(url: string) {
    setLoadedImages((current) => current[url] ? current : { ...current, [url]: true });
  }

  return (
    <div role="group" aria-label="Galería de fotos" className={`min-w-0 [--gallery-max-height:32rem] lg:[--gallery-max-height:42rem] [@media(max-height:500px)]:[--gallery-max-height:70dvh] ${hasThumbnails ? "lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:items-start lg:gap-4" : ""}`}>
      <div className={`flex min-w-0 justify-center ${hasThumbnails ? "lg:col-start-2 lg:row-start-1" : ""}`}>
        <div className={`relative max-w-full ${imageUnavailable || imageLoading ? "w-full" : "w-fit"}`}>
          <div aria-live="polite">
            {imageUnavailable ? (
              <div className="flex aspect-[4/3] max-h-(--gallery-max-height) w-full flex-col items-center justify-center rounded-3xl bg-[var(--boutique-ink,#102033)] px-12 text-center text-[var(--boutique-canvas,#F7F9FC)]" role="img" aria-label={`Imagen no disponible de ${productName}`}>
                <span className="break-all text-5xl font-semibold">{placeholder}</span>
                <span className="mt-3 text-sm">{hasNavigation ? "Imagen no disponible. Probá otra foto." : "Imagen no disponible."}</span>
              </div>
            ) : (
              // Catalog originals do not come with dimensions for an intrinsic Next Image layout.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={selectedImage.url}
                src={selectedImage.url}
                ref={(image) => {
                  if (image?.complete) (image.naturalWidth === 0 ? markImageFailed : markImageLoaded)(selectedImage.url);
                }}
                alt={selectedImage.alt ?? productName}
                className={`block h-auto max-h-(--gallery-max-height) max-w-full rounded-3xl object-contain shadow-[var(--boutique-shadow,none)] ${imageLoading ? "mx-auto aspect-[3/4] w-[min(100%,calc(var(--gallery-max-height)*3/4))]" : "w-auto"}`}
                onLoad={() => markImageLoaded(selectedImage.url)}
                onError={() => markImageFailed(selectedImage.url)}
              />
            )}
          </div>
          {hasNavigation ? <>
            <GalleryArrow direction="previous" onClick={() => moveSelection(-1)} />
            <GalleryArrow direction="next" onClick={() => moveSelection(1)} />
          </> : null}
        </div>
      </div>

      {hasThumbnails ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2.5 md:mt-4 md:gap-4 lg:col-start-1 lg:row-start-1 lg:mt-0 lg:flex-col lg:items-center lg:gap-3">
          {sortedImages.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`grid h-12 w-16 grid-rows-[minmax(0,1fr)] place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--boutique-olive,#003B73)] md:h-[4.25rem] md:w-[4.25rem] ${
                index === activeIndex ? "outline-2 outline-offset-2 outline-[var(--boutique-focus,#0072CE)]" : ""
              }`}
              aria-label={`Ver imagen ${index + 1} de ${productName}`}
              aria-pressed={index === activeIndex}
            >
              {failedImages[image.url] ? <span aria-hidden="true" className="text-lg text-[var(--boutique-muted,#45576A)]">—</span> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  onError={() => markImageFailed(image.url)}
                  className="block h-auto max-h-full w-auto max-w-full rounded-lg object-contain"
                />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}


