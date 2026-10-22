"use client";

import { useState } from "react";

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

export function HomeHeroSlider({ slides }: HomeHeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeSlide = slides[activeIndex] ?? slides[0];

  if (!activeSlide) {
    return null;
  }



  return (
    <section className="mx-auto max-w-6xl px-5 pb-8 pt-6 sm:px-8 lg:pb-10 lg:pt-10">
      <div className="min-w-0">
        <a
          href={activeSlide.primaryCtaHref}
          aria-label={activeSlide.primaryCtaLabel}
          className="block min-w-0 overflow-hidden rounded-[2rem] border border-[#DCE3EA] bg-white shadow-2xl shadow-[#102033]/10 outline-none transition hover:shadow-[#102033]/15 focus-visible:ring-2 focus-visible:ring-[#0072CE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F9FC]"
        >
          <div className="flex min-h-56 flex-col justify-center gap-4 bg-[linear-gradient(115deg,#F7F9FC_0%,#EEF2F6_100%)] p-6 sm:min-h-80 sm:p-12">
            <h2 className="max-w-2xl text-3xl font-semibold text-[#102033] sm:text-5xl">{activeSlide.title}</h2>
            <p className="max-w-xl text-base text-[#102033]/75">{activeSlide.subtitle}</p>
            <p className="font-semibold text-[#003B73]">25% OFF por transferencia · pago completo</p>
            <span className="w-fit rounded-full bg-[#0072CE] px-5 py-3 font-semibold text-white">{activeSlide.primaryCtaLabel}</span>
          </div>
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

