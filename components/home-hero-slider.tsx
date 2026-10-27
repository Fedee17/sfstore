"use client";

import { useState } from "react";

export type HomeHeroSlide = {
  imageSrc?: string;
  imageAlt?: string;
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
    <section className="mx-auto max-w-6xl px-5 pb-3 pt-5 sm:px-8 lg:pb-4 lg:pt-8">
      <div className="min-w-0">
        <a
          href={activeSlide.primaryCtaHref}
          aria-label={activeSlide.primaryCtaLabel}
          className="block min-w-0 overflow-hidden rounded-[2rem] border border-[#DCE3EA] bg-white shadow-2xl shadow-[#102033]/10 outline-none transition hover:shadow-[#102033]/15 focus-visible:ring-2 focus-visible:ring-[#0072CE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F9FC]"
        >
          <div className={`grid bg-[linear-gradient(115deg,#F7F9FC_0%,#EEF2F6_100%)] ${hasImage ? "sm:grid-cols-2" : ""}`}>
            <div className="flex flex-col justify-center gap-3 p-5 sm:p-8">
              <h2 className="max-w-2xl text-3xl font-semibold text-[#102033] sm:text-5xl">{activeSlide.title}</h2>
              <p className="max-w-xl text-base text-[#102033]/75">{activeSlide.subtitle}</p>
              <span className="w-fit rounded-full bg-[#0072CE] px-5 py-3 font-semibold text-white">{activeSlide.primaryCtaLabel}</span>
            </div>
            {hasImage ? (
              <img src={activeSlide.imageSrc} alt={activeSlide.imageAlt} loading="eager" className="aspect-[4/3] h-full max-h-96 w-full object-contain" />
            ) : null}
          </div>
        </a>

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

