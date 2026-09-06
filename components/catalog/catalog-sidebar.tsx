"use client";

import { useRouter, useSearchParams } from "next/navigation";

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
};

export function CatalogSidebar({
  ariaLabel,
  basePath,
  categories,
  filtersByCategory,
  selectedCategory,
  viewAllLabel,
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
    <div className="min-h-[32rem] min-w-0 transition-[opacity,transform] duration-200">
      {!selectedCategoryItem ? (
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#102033]">Categorías</h2>
          <nav className="mt-3 grid min-w-0 gap-1" aria-label={ariaLabel}>
            <button
              type="button"
              onClick={() => router.push(basePath, { scroll: false })}
              className="flex min-h-11 w-full cursor-pointer items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#003B73] transition hover:bg-[#0072CE]/8"
            >
              Todos
            </button>
            {categories.map((category) => (
              <button
                key={category.hrefValue}
                type="button"
                onClick={() => selectCategory(category)}
                className="flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#003B73] transition hover:bg-[#0072CE]/8 hover:text-[#0072CE]"
              >
                <span className="min-w-0 break-words">{category.label}</span>
                <span aria-hidden="true" className="shrink-0 text-[#0072CE]">
                  &gt;
                </span>
              </button>
            ))}
          </nav>
        </div>
      ) : (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push(basePath, { scroll: false })}
            className="inline-flex min-h-10 cursor-pointer items-center text-sm font-semibold text-[#0072CE] transition hover:text-[#003B73]"
          >
            ← Volver a categorías
          </button>

          <div className="mt-2 flex min-w-0 items-center justify-between gap-3 border-b border-[#DCE3EA] pb-4">
            <h2 className="min-w-0 break-words text-xl font-semibold text-[#102033]">
              {selectedCategoryItem.label}
            </h2>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="shrink-0 cursor-pointer text-xs font-semibold text-[#0072CE] underline-offset-4 hover:underline"
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid min-w-0 gap-5">
            {filterGroups.map((group) => (
              <div key={group.param} className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#102033]/55">
                  {group.label}
                </p>
                <div className="mt-2 grid min-w-0 gap-1">
                  {group.options.map((option) => {
                    const active = searchParams.get(group.param) === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateFilter(group.param, option.value)}
                        className={`flex min-h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                          active
                            ? "bg-[#0072CE]/10 font-semibold text-[#0072CE]"
                            : "text-[#003B73] hover:bg-[#EEF2F6]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 shrink-0 rounded border ${
                            active
                              ? "border-[#0072CE] bg-[#0072CE]"
                              : "border-[#003B73]/30 bg-white"
                          }`}
                        />
                        <span className="min-w-0 break-words">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={clearFilters}
            className="mt-5 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-full border border-[#0072CE]/30 px-4 py-2 text-sm font-semibold text-[#0072CE] transition hover:border-[#0072CE] hover:bg-[#EEF2F6]"
          >
            {viewAllLabel ?? `Ver todos los ${selectedCategoryItem.label}`}
          </button>
        </div>
      )}
    </div>
  );
}
