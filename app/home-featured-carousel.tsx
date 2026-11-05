"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import styles from "./home-featured.module.css";

const desktopQuery = "(min-width: 1024px)";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const rotationInterval = 8000;

function subscribeToLayout(update: () => void) {
  const queries = [window.matchMedia(desktopQuery), window.matchMedia(reducedMotionQuery)];
  queries.forEach(query => query.addEventListener("change", update));
  return () => queries.forEach(query => query.removeEventListener("change", update));
}

function getColumns() {
  if (window.matchMedia(reducedMotionQuery).matches) return 0;
  return window.matchMedia(desktopQuery).matches ? 3 : 2;
}

function nextSlide(index: number, direction: number, last: number) {
  const next = Math.min(index, last) + direction;
  if (next > last) return { index: 0, animate: false };
  if (next < 0) return { index: last, animate: false };
  return { index: next, animate: true };
}

export function HomeFeaturedCarousel({ cards }: { cards: ReactNode[] }) {
  const columns = useSyncExternalStore(subscribeToLayout, getColumns, () => 0);
  const carousel = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState({ index: 0, animate: false });
  const [visible, setVisible] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [stopped, setStopped] = useState(false);
  const enabled = columns > 0 && cards.length > columns;
  const swipe = enabled && columns === 2;
  const arrows = enabled && !swipe;
  const last = enabled ? cards.length - columns : 0;
  const index = Math.min(slide.index, last);

  function move(direction: number) {
    setSlide(previous => nextSlide(previous.index, direction, last));
  }

  useEffect(() => {
    if (!enabled || !carousel.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= 0.55), { threshold: 0.55 });
    observer.observe(carousel.current);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !visible || hovering || stopped) return;

    function schedule() {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        setSlide(previous => nextSlide(previous.index, 1, last));
        schedule();
      }, rotationInterval);
    }

    let timer: number;
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [enabled, visible, hovering, stopped, last]);

  useEffect(() => {
    if (!swipe || !viewport.current || !track.current) return;
    const first = track.current.children[0] as HTMLElement;
    const current = track.current.children[index] as HTMLElement;
    viewport.current.scrollTo({ left: current.offsetLeft - first.offsetLeft, behavior: slide.animate ? "smooth" : "instant" });
  }, [swipe, index, slide.animate]);

  return (
    <div
      ref={carousel}
      className={styles.carousel}
      data-rotating-layout={enabled || undefined}
      data-swipe={swipe || undefined}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setStopped(true)}
      onPointerDown={() => setStopped(true)}
    >
      {arrows && (
        <button type="button" className={styles.previous} aria-label="Producto anterior" aria-controls="home-featured-track" onClick={() => move(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
      )}
      <div ref={viewport} className={styles.viewport}>
        <div
          ref={track}
          id="home-featured-track"
          className={styles.track}
          data-animate={arrows && slide.animate && index === slide.index || undefined}
          style={{ "--featured-index": index } as CSSProperties}
        >
          {cards.map((card, position) => (
            <div key={position} inert={arrows && (position < index || position >= index + columns)}>{card}</div>
          ))}
        </div>
      </div>
      {arrows && (
        <button type="button" className={styles.next} aria-label="Producto siguiente" aria-controls="home-featured-track" onClick={() => move(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      )}
    </div>
  );
}
