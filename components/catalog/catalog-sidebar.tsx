"use client";

import { useRouter, useSearchParams } from "next/navigation";
import styles from "./catalog.module.css";

export type CatalogCategoryOption = {
  label: string;
  hrefValue: string;
  matchValue: string;
};

export type CatalogFilterOption = {
  label: string;
  value: string;
};

export type CatalogFilterGroup = {
  label: string;
  param: string;
  options: CatalogFilterOption[];
};

type CatalogSidebarProps = {
  ariaLabel: string;
  basePath: string;
  categories: CatalogCategoryOption[];
  filtersByCategory: Record<string, CatalogFilterGroup[]>;
  selectedCategory: string;
  viewAllLabel?: string;
  compactFilters?: boolean;
};

export function CatalogSidebar({
  ariaLabel,
  basePath,
  categories,
  filtersByCategory,
  selectedCategory,
  viewAllLabel,
  compactFilters = false,
}: CatalogSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCategory = searchParams.get("categoria") ?? "";
  const selectedCategoryItem = categories.find(
    (category) =>
      category.hrefValue === urlCategory ||
      category.matchValue === selectedCategory,
  );
  const filterGroups = selectedCategoryItem
    ? filtersByCategory[selectedCategoryItem.matchValue] ?? []
    : [];
  const hasActiveFilters = filterGroups.some((group) =>
    Boolean(searchParams.get(group.param)),
  );
  const FilterGroup = compactFilters ? "details" : "div";
  const scrollCategories = compactFilters && categories.length > 4;

  function pushParams(params: URLSearchParams) {
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath, {
      scroll: false,
    });
  }

  function selectCategory(category: CatalogCategoryOption) {
    const params = new URLSearchParams();
    params.set("categoria", category.hrefValue);
    pushParams(params);
  }

  function updateFilter(param: string, value: string) {
    if (!selectedCategoryItem) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("categoria", selectedCategoryItem.hrefValue);

    if (params.get(param) === value) {
      params.delete(param);
    } else {
      params.set(param, value);
    }

    pushParams(params);
  }

  function clearFilters() {
    if (!selectedCategoryItem) {
      return;
    }

    const params = new URLSearchParams();
    params.set("categoria", selectedCategoryItem.hrefValue);
    pushParams(params);
  }

  return (
    <div className="min-w-0">
      {!selectedCategoryItem ? (
        <div className="min-w-0">
          <h2 className={`${styles.heading} px-3 py-2 text-sm font-bold`}>Categorías</h2>
          <nav
            className={`grid min-w-0 gap-1 ${scrollCategories ? `${styles.scroll} max-h-[min(16rem,50dvh)] overflow-y-auto overscroll-contain pe-1` : ""}`}
            aria-label={ariaLabel}
            tabIndex={scrollCategories ? 0 : undefined}
          >
            <button
              type="button"
              onClick={() => router.push(basePath, { scroll: false })}
              aria-current="true"
              className={`${styles.item} flex min-h-11 w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left text-sm font-bold`}
            >
              Todos
            </button>
            {categories.map((category) => (
              <button
                key={category.hrefValue}
                type="button"
                onClick={() => selectCategory(category)}
                className={`${styles.item} flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition`}
              >
                <span className="min-w-0 break-words">{category.label}</span>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
            ))}
          </nav>
        </div>
      ) : (
        <div className="min-w-0">
          {!compactFilters ? <button
            type="button"
            onClick={() => router.push(basePath, { scroll: false })}
            className={`${styles.link} inline-flex min-h-10 cursor-pointer items-center text-sm font-semibold transition`}
          >
            ← Volver a categorías
          </button> : null}

          <div className={`${styles.divider} flex min-w-0 flex-wrap items-center justify-between gap-2 ${compactFilters ? "px-2 pb-2" : "mt-2 pb-4"}`}>
            <h2 className={`${styles.heading} min-w-0 break-words font-semibold ${compactFilters ? "text-sm" : "text-xl"}`}>
              {compactFilters ? "Filtros" : selectedCategoryItem.label}
            </h2>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className={`${styles.link} shrink-0 cursor-pointer text-xs font-semibold underline-offset-4 hover:underline`}
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>

          <div className={`grid min-w-0 ${compactFilters ? "mt-1 gap-1" : "mt-4 gap-5"}`}>
            {filterGroups.map((group) => {
              const selectedOption = group.options.find((option) => option.value === searchParams.get(group.param));
              return (
                <FilterGroup key={group.param} name={compactFilters ? "catalog-filter-groups" : undefined}
                  className={compactFilters ? `${styles.groupOpen} min-w-0 rounded-lg border border-transparent` : "min-w-0"}>
                  {compactFilters ? (
                    <summary className={`${styles.summary} min-h-10 cursor-pointer rounded-lg px-2 py-2.5 text-sm font-semibold`}>
                      {group.label}
                      {selectedOption ? <span className={`${styles.hint} block ps-4 text-xs`}>{selectedOption.label}</span> : null}
                    </summary>
                  ) : <p className={`${styles.hint} text-xs font-bold uppercase tracking-[0.12em]`}>
                    {group.label}
                  </p>}
                  <div className={`grid min-w-0 gap-1 ${compactFilters ? "max-h-[min(13rem,40dvh)] overflow-y-auto overscroll-contain p-1" : "mt-2"}`}>
                    {group.options.map((option) => {
                      const active = searchParams.get(group.param) === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateFilter(group.param, option.value)}
                          className={`${styles.filter} flex min-h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${active ? "font-semibold" : ""}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`${styles.check} h-3.5 w-3.5 shrink-0 rounded`}
                          />
                          <span className="min-w-0 break-words">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </FilterGroup>
              );
            })}
          </div>

          {!compactFilters ? <button
            type="button"
            onClick={clearFilters}
            className={`${styles.contact} mt-5 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition`}
          >
            {viewAllLabel ?? `Ver todos los ${selectedCategoryItem.label}`}
          </button> : null}
        </div>
      )}
    </div>
  );
}
