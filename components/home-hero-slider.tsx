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
          <div className={hasImage ? "relative grid h-[520px] bg-[#102033] sm:h-auto sm:grid-cols-[0.85fr_1.65fr] sm:bg-[linear-gradient(115deg,#F7F9FC_0%,#EEF2F6_100%)]" : "grid bg-[linear-gradient(115deg,#F7F9FC_0%,#EEF2F6_100%)]"}>
            <div aria-live="polite" aria-atomic="true" className={`flex flex-col justify-center sm:p-8 ${hasImage ? "absolute inset-x-0 top-0 z-20 gap-2 p-4 sm:static sm:z-auto sm:gap-3" : "gap-3 p-5"}`}>
              <h2 className={`max-w-2xl font-semibold sm:text-3xl lg:text-4xl ${hasImage ? "text-[1.375rem] leading-tight text-white sm:leading-9 sm:text-[#102033] lg:leading-10" : "text-2xl text-[#102033]"}`}>{activeSlide.title}</h2>
              <p className={`max-w-xl sm:text-base ${hasImage ? "text-sm leading-5 text-white sm:text-[#102033]/75 sm:leading-normal" : "text-base text-[#102033]/75"}`}>{activeSlide.subtitle}</p>
              <a href={activeSlide.primaryCtaHref} className="inline-flex min-h-11 w-fit items-center rounded-full bg-[#0072CE] px-5 py-3 text-sm font-semibold text-white sm:text-base focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0072CE]">{activeSlide.primaryCtaLabel}</a>
            </div>
            {hasImage ? (
              <picture className="absolute inset-0 block min-w-0 pt-14 sm:static sm:pt-0">
                <source media="(min-width: 640px)" srcSet={activeSlide.imageSrcSet ?? activeSlide.imageSrc} sizes="(min-width: 1152px) 730px, 65vw" />
                <img src={activeSlide.mobileImageSrc ?? activeSlide.imageSrc} srcSet={activeSlide.mobileImageSrcSet} sizes="calc(100vw - 40px)" alt={activeSlide.imageAlt} width={1600} height={666} loading="eager" fetchPriority={activeIndex === 0 ? "high" : "auto"} decoding="async" className="h-full w-full object-contain object-bottom sm:aspect-[12/5] sm:object-center" />
              </picture>
            ) : null}
            {hasImage ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[232px] bg-[linear-gradient(to_bottom,rgba(16,32,51,0.96)_0%,rgba(16,32,51,0.76)_75%,transparent_100%)] sm:hidden" /> : null}
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

