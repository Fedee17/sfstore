"use client";

import { useState, type CSSProperties } from "react";
import styles from "./home-hero-slider.module.css";
import { useCarouselRotation } from "./use-carousel-rotation";

// Long enough to read the title and description before the banner changes.
const bannerRotationInterval = 5000;

export type HomeHeroSlide = {
  composition?: "continuous";
  desktopImagePosition?: string;
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
  const [hovering, setHovering] = useState(false);
  const [stopped, setStopped] = useState(false);
  // Pauses on hover; stops for good once the visitor focuses or picks a banner (WCAG 2.2.2).
  const rotating = useCarouselRotation(slides.length > 1 && !hovering && !stopped, () => setActiveIndex((index) => (index + 1) % slides.length), bannerRotationInterval);

  // Touch on iOS does not always focus a button, so a tap also stops the rotation.
  const stop = () => setStopped(true);

  const activeSlide = slides[activeIndex] ?? slides[0];

  if (!activeSlide) {
    return null;
  }

  const continuous = activeSlide.composition === "continuous";
  const hasImage = Boolean(activeSlide.imageSrc && activeSlide.imageAlt);

  return (
    <section aria-label="Selección de perfumes árabes" aria-roledescription="carrusel" className="mx-auto max-w-6xl px-5 pb-3 pt-5 sm:px-8 lg:pb-4 lg:pt-8" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} onFocusCapture={stop} onPointerDown={stop}>
      <div className="min-w-0">
        <div
          className={`${styles.frame} block min-w-0 overflow-hidden rounded-[2rem] border`}
        >
          <div className={continuous ? styles.scene : hasImage ? "relative grid h-[520px] bg-[#102033] sm:h-auto sm:grid-cols-[0.85fr_1.65fr] sm:bg-[linear-gradient(115deg,#F7F9FC_0%,#EEF2F6_100%)]" : "grid bg-[linear-gradient(115deg,#F7F9FC_0%,#EEF2F6_100%)]"}>
            <div aria-live={rotating ? "off" : "polite"} aria-atomic="true" className={continuous ? styles.copy : `flex flex-col justify-center sm:p-8 ${hasImage ? "absolute inset-x-0 top-0 z-20 gap-2 p-4 sm:static sm:z-auto sm:gap-3" : "gap-3 p-5"}`}>
              <h2 className={continuous ? styles.title : `max-w-2xl font-semibold sm:text-3xl lg:text-4xl ${hasImage ? "text-[1.375rem] leading-tight text-white sm:leading-9 sm:text-[#102033] lg:leading-10" : "text-2xl text-[#102033]"}`}>{activeSlide.title}</h2>
              <p className={continuous ? styles.description : `max-w-xl sm:text-base ${hasImage ? "text-sm leading-5 text-white sm:text-[#102033]/75 sm:leading-normal" : "text-base text-[#102033]/75"}`}>{activeSlide.subtitle}</p>
              <a href={activeSlide.primaryCtaHref} className={`${styles.cta} inline-flex min-h-11 w-fit items-center rounded-full px-5 py-3 text-sm font-semibold sm:text-base`}>{activeSlide.primaryCtaLabel}</a>
            </div>
            {hasImage ? (
              <picture className={continuous ? styles.picture : "absolute inset-0 block min-w-0 pt-14 sm:static sm:pt-0"}>
                <source media="(min-width: 640px)" srcSet={activeSlide.imageSrcSet ?? activeSlide.imageSrc} sizes={continuous ? "(min-width: 1152px) 1088px, calc(100vw - 64px)" : "(min-width: 1152px) 730px, 65vw"} width={1600} height={616} />
                <img src={activeSlide.mobileImageSrc ?? activeSlide.imageSrc} srcSet={activeSlide.mobileImageSrcSet} sizes="calc(100vw - 40px)" alt={activeSlide.imageAlt} width={768} height={1152} loading="eager" fetchPriority={activeIndex === 0 ? "high" : "auto"} decoding="async" style={continuous && activeSlide.desktopImagePosition ? { "--hero-desktop-position": activeSlide.desktopImagePosition } as CSSProperties : undefined} className={continuous ? styles.photo : "h-full w-full object-contain object-bottom sm:aspect-[12/5] sm:object-center"} />
              </picture>
            ) : null}
            {hasImage ? <div aria-hidden="true" className={continuous ? styles.shade : "pointer-events-none absolute inset-x-0 top-0 z-10 h-[232px] bg-[linear-gradient(to_bottom,rgba(16,32,51,0.96)_0%,rgba(16,32,51,0.76)_75%,transparent_100%)] sm:hidden"} /> : null}
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
                className={`${styles.dot} flex min-h-11 min-w-11 items-center justify-center rounded-full`}
              >
                <span aria-hidden="true" className={`h-2.5 rounded-full transition-all ${index === activeIndex ? "w-8" : "w-2.5"}`} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

