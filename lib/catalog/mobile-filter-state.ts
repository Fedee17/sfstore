import type { CatalogCategoryOption, CatalogFilterGroup } from "@/components/catalog/catalog-sidebar";

/** Only existing options enter the draft/URL; the server remains the filter authority. */
export function readMobileFilterDraft(groups: CatalogFilterGroup[], params: URLSearchParams) {
  return Object.fromEntries(groups.flatMap((group) => {
    const value = params.get(group.param);
    return group.options.some((option) => option.value === value) ? [[group.param, value!]] : [];
  }));
}

export function mobileFilterHref(basePath: string, category: CatalogCategoryOption | undefined, groups: CatalogFilterGroup[], draft: Record<string, string>) {
  const params = new URLSearchParams();
  if (category) params.set("categoria", category.hrefValue);
  for (const group of groups) {
    if (group.options.some((option) => option.value === draft[group.param])) {
      params.set(group.param, draft[group.param]);
    }
  }
  return params.size ? `${basePath}?${params}` : basePath;
}
