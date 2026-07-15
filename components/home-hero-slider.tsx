"use client";

import { useEffect, useState } from "react";

export type HomeHeroSlide = {
  imageSrc: string;
  imageAlt: string;
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
};

type HomeHeroSliderProps = {
  slides: HomeHeroSlide[];
};

const AUTOPLAY_INTERVAL_MS = 3000;

export function HomeHeroSlider({ slides }: HomeHeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const activeSlide = slides[activeIndex] ?? slides[0];

  useEffect(() => {
    if (slides.length <= 1 || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % slides.length);
    }, AUTOPLAY_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isPaused, slides.length]);

  if (!activeSlide) {
    return null;
  }

  const activeImageFailed = failedImages[activeSlide.imageSrc];

  return (
    <section className="mx-auto max-w-6xl px-5 pb-8 pt-6 sm:px-8 lg:pb-10 lg:pt-10">
      <div
        className="min-w-0"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <a
          href={activeSlide.primaryCtaHref}
          aria-label={activeSlide.primaryCtaLabel}
          className="block min-w-0 overflow-hidden rounded-[2rem] border border-[#DCE3EA] bg-white shadow-2xl shadow-[#102033]/10 outline-none transition hover:shadow-[#102033]/15 focus-visible:ring-2 focus-visible:ring-[#0072CE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F9FC]"
        >
          {!activeImageFailed ? (
            <img
              src={activeSlide.imageSrc}
              alt={activeSlide.imageAlt}
              className="h-auto w-full max-w-full"
              loading={activeIndex === 0 ? "eager" : "lazy"}
              onError={() =>
                setFailedImages((currentFailedImages) => ({
                  ...currentFailedImages,
                  [activeSlide.imageSrc]: true,
                }))
              }
            />
          ) : (
            <div className="flex aspect-[16/6] min-h-[190px] w-full items-center justify-center bg-[linear-gradient(115deg,#F7F9FC_0%,#EEF2F6_52%,#0072CE_100%)] px-6 text-center text-[#102033]">
              <span className="max-w-lg break-words text-2xl font-semibold sm:text-4xl">
                {activeSlide.title}
              </span>
            </div>
          )}
        </a>

        {slides.length > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.imageSrc}
                type="button"
                aria-label={`Ver banner ${index + 1}: ${slide.title}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
                className={`h-2.5 rounded-full transition-all ${
                  index === activeIndex
                    ? "w-8 bg-[#0072CE]"
                    : "w-2.5 bg-[#DCE3EA] hover:bg-[#0072CE]/45"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

