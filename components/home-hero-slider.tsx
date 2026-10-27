"use client";

import { useState } from "react";

export type HomeHeroSlide = {
  imageSrc?: string;
  imageAlt?: string;
  imageSrcSet?: string;
  mobileImageSrc?: string;
  mobileImageSrcSet?: string;
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

export function HomeHeroSlider({ slides }: HomeHeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeSlide = slides[activeIndex] ?? slides[0];

  if (!activeSlide) {
    return null;
  }



  const hasImage = Boolean(activeSlide.imageSrc && activeSlide.imageAlt);

  return (
    <section aria-label="Selección de perfumes árabes" aria-roledescription="carrusel" className="mx-auto max-w-6xl px-5 pb-3 pt-5 sm:px-8 lg:pb-4 lg:pt-8">
      <div className="min-w-0">
        <div
          className="block min-w-0 overflow-hidden rounded-[2rem] border border-[#DCE3EA] bg-white shadow-2xl shadow-[#102033]/10 "
        >
          <div className={`grid bg-[linear-gradient(115deg,#F7F9FC_0%,#EEF2F6_100%)] ${hasImage ? "sm:grid-cols-[0.85fr_1.65fr]" : ""}`}>
            <div aria-live="polite" aria-atomic="true" className="flex flex-col justify-center gap-3 p-5 sm:p-8">
              <h2 className="max-w-2xl text-2xl font-semibold text-[#102033] sm:text-3xl lg:text-4xl">{activeSlide.title}</h2>
              <p className="max-w-xl text-base text-[#102033]/75">{activeSlide.subtitle}</p>
              <a href={activeSlide.primaryCtaHref} className="inline-flex min-h-11 w-fit items-center rounded-full bg-[#0072CE] px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">{activeSlide.primaryCtaLabel}</a>
            </div>
            {hasImage ? (
              <picture className="block min-w-0">
                <source media="(min-width: 640px)" srcSet={activeSlide.imageSrcSet ?? activeSlide.imageSrc} sizes="(min-width: 1152px) 730px, 65vw" />
                <img src={activeSlide.mobileImageSrc ?? activeSlide.imageSrc} srcSet={activeSlide.mobileImageSrcSet} sizes="calc(100vw - 40px)" alt={activeSlide.imageAlt} width={1600} height={666} loading="eager" fetchPriority={activeIndex === 0 ? "high" : "auto"} decoding="async" className="aspect-[4/5] h-full w-full object-cover sm:aspect-[12/5] sm:object-contain" />
              </picture>
            ) : null}
          </div>
        </div>

        {slides.length > 1 ? (
          <div className="mt-1 flex items-center justify-center gap-2">
            {slides.map((slide, index) => (
              <button
                key={`${slide.primaryCtaHref}-${index}`}
                type="button"
                aria-label={`Ver banner ${index + 1}: ${slide.title}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-[#0072CE]"
              >
                <span aria-hidden="true" className={`h-2.5 rounded-full transition-all ${
                  index === activeIndex
                    ? "w-8 bg-[#0072CE]"
                    : "w-2.5 bg-[#DCE3EA] hover:bg-[#0072CE]/45"
                }`} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

