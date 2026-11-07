"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import styles from "./home-featured.module.css";

const desktopQuery = "(min-width: 1024px)";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const rotationInterval = 4000;

function subscribeToLayout(update: () => void) {
  const queries = [desktopQuery, reducedMotionQuery].map(query => window.matchMedia(query));
  queries.forEach(query => query.addEventListener("change", update));
  return () => queries.forEach(query => query.removeEventListener("change", update));
}

function getColumns() {
  if (window.matchMedia(reducedMotionQuery).matches) return 0;
  return window.matchMedia(desktopQuery).matches ? 3 : 2;
}

function nextSlide(index: number, direction: number, last: number, loop: boolean) {
  if (loop) {
    if (index < 0 || index > last) return { index, animate: true };
    return { index: index + direction, animate: true };
  }
  const next = Math.min(index, last) + direction;
  if (next > last) return { index: 0, animate: false };
  if (next < 0) return { index: last, animate: false };
  return { index: next, animate: true };
}

export function HomeFeaturedCarousel({ cards, previews }: { cards: ReactNode[]; previews?: ReactNode[] }) {
  const trackId = useId();
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
  const loop = arrows && previews?.length === cards.length;
  const last = loop ? cards.length - 1 : enabled ? cards.length - columns : 0;
  const index = loop ? Math.max(-1, Math.min(slide.index, cards.length)) : Math.max(0, Math.min(slide.index, last));
  const offset = loop ? columns + 1 : 0;
  const entries = cards.map((card, position) => ({ card, position, key: `product-${position}` }));
  if (loop) {
    const before = Array.from({ length: offset }, (_, position) => ({
      card: previews[(cards.length - offset + position) % cards.length],
      position: position - offset,
      key: `before-${position}`,
    }));
    const after = Array.from({ length: offset }, (_, position) => ({
      card: previews[position % cards.length],
      position: cards.length + position,
      key: `after-${position}`,
    }));
    entries.unshift(...before);
    entries.push(...after);
  }

  function move(direction: number) {
    setSlide(previous => nextSlide(previous.index, direction, last, loop));
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
        setSlide(previous => nextSlide(previous.index, 1, last, loop));
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
  }, [enabled, visible, hovering, stopped, last, loop]);

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
        <button type="button" className={styles.previous} aria-label="Producto anterior" aria-controls={trackId} onClick={() => move(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
      )}
      <div className={styles.window}>
       <div ref={viewport} className={styles.viewport}>
        <div
          ref={track}
          id={trackId}
          className={styles.track}
          data-animate={arrows && slide.animate && index === slide.index || undefined}
          style={{ "--featured-index": index + offset } as CSSProperties}
          onTransitionEnd={event => {
            if (!loop || event.target !== track.current || event.propertyName !== "transform") return;
            setSlide(previous => {
              if (previous.index >= cards.length) return { index: 0, animate: false };
              if (previous.index < 0) return { index: cards.length - 1, animate: false };
              return previous;
            });
          }}
        >
          {entries.map(({ card, position, key }) => {
            const peripheral = arrows && (position < index || position >= index + columns);
            return <div key={key} inert={peripheral} aria-hidden={peripheral || undefined}
              data-peripheral={peripheral || undefined}>{card}</div>;
          })}
        </div>
       </div>
      </div>
      {arrows && (
        <button type="button" className={styles.next} aria-label="Producto siguiente" aria-controls={trackId} onClick={() => move(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      )}
    </div>
  );
}
