"use client";

import { useState, type KeyboardEvent } from "react";
import { HomeProductCarousel } from "./home-product-card";
import type { PublicProduct } from "@/services/products";
import featuredStyles from "./home-featured.module.css";
import styles from "./ritual-matero.module.css";

type Group = { label: string; products: PublicProduct[] };

export function RitualMatero({ groups }: { groups: Group[] }) {
  const [active, setActive] = useState(0);

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (active + 1) % groups.length; break;
      case "ArrowLeft": next = (active + groups.length - 1) % groups.length; break;
      case "Home": next = 0; break;
      case "End": next = groups.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setActive(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <section id="ritual-matero" aria-labelledby="ritual-matero-title" className={`${featuredStyles.section} mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:py-10`}>
      <h2 id="ritual-matero-title" className={featuredStyles.sectionTitle}>Ritual Matero</h2>
      <div className={styles.tabs} role="tablist" aria-label="Categorías de Ritual Matero" onKeyDown={moveTab}>
        {groups.map(({ label }, index) => (
          <button key={label} type="button" role="tab" id={`ritual-tab-${index}`}
            aria-selected={index === active} aria-controls={`ritual-panel-${index}`}
            tabIndex={index === active ? 0 : -1} onClick={() => setActive(index)}>
            {label}
          </button>
        ))}
      </div>
      {groups.map(({ label, products }, index) => (
        <div key={label} role="tabpanel" id={`ritual-panel-${index}`}
          aria-labelledby={`ritual-tab-${index}`} hidden={index !== active}>
          {index === active && (products.length ? (
            <HomeProductCarousel products={products} label={label} directPurchase />
          ) : <p className={styles.empty}>Por ahora no hay publicaciones en esta categoría.</p>)}
        </div>
      ))}
    </section>
  );
}
