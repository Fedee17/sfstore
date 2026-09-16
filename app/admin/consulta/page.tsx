import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import { ConsultationProductCard } from "@/components/admin/consulta/consultation-product-card";
import { PerfumeRecommendationForm } from "@/components/admin/consulta/perfume-recommendation-form";
import { QuickCatalogView } from "@/components/admin/consulta/quick-catalog-view";
import type { QuickCatalogProduct } from "@/lib/admin/quick-catalog";
import {
  getConsultationMode,
  getEligiblePerfumeRecommendationProducts,
  hasEffectivePerfumePreferences,
  parsePerfumeRecommendationPreferences,
  type ConsultationSearchParams,
} from "@/lib/admin/perfume-recommendation-query";
import {
  recommendPerfumeGroups,
  type PerfumeRecommendation,
} from "@/lib/catalog/perfume-recommendation";
import { requireAdminSession } from "@/lib/admin-session";
import { getQuickCatalogProducts } from "@/services/admin-catalog";

type AdminQuickCatalogPageProps = {
  searchParams?: Promise<ConsultationSearchParams>;
};

function ModeNavigation({ mode }: { mode: "search" | "recommend" }) {
  const links = [
    { href: "/admin/consulta", value: "search", label: "Buscar" },
    {
      href: "/admin/consulta?mode=recommend",
      value: "recommend",
      label: "Recomendar",
    },
  ] as const;

  return (
    <nav
      aria-label="Modo de consulta"
      className="mt-6 inline-flex rounded-md border border-[#8B5E3C]/20 bg-white p-1"
    >
      {links.map((link) => (
        <Link
          key={link.value}
          href={link.href}
          aria-current={mode === link.value ? "page" : undefined}
          className={
            mode === link.value
              ? "flex min-h-11 items-center rounded bg-[#556B2F] px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
              : "flex min-h-11 items-center rounded px-5 text-sm font-semibold text-[#1F1F1F]/65 hover:bg-[#F7F4ED] hover:text-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function RecommendationGroup({
  title,
  description,
  recommendations,
  tone,
}: {
  title: string;
  description: string;
  recommendations: PerfumeRecommendation<QuickCatalogProduct>[];
  tone: "primary" | "secondary" | "unavailable" | "decant";
}) {
  if (recommendations.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="border-b border-[#8B5E3C]/15 pb-3">
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-[#1F1F1F]/60">{description}</p>
      </div>
      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
        {recommendations.map((recommendation) => (
          <ConsultationProductCard
            key={recommendation.product.id}
            product={recommendation.product}
            recommendation={recommendation}
            tone={tone}
          />
        ))}
      </div>
    </section>
  );
}

export default async function AdminQuickCatalogPage({
  searchParams,
}: AdminQuickCatalogPageProps) {
  await requireAdminSession();

  const params = searchParams ? await searchParams : {};
  const mode = getConsultationMode(params);
  const catalog = await getQuickCatalogProducts();
  const preferences = parsePerfumeRecommendationPreferences(params);
  const hasPreferences = hasEffectivePerfumePreferences(preferences);
  const recommendationGroups =
    mode === "recommend" && hasPreferences
      ? recommendPerfumeGroups(
          getEligiblePerfumeRecommendationProducts(catalog.data),
          preferences,
        )
      : null;
  const recommendationCount = recommendationGroups
    ? Object.values(recommendationGroups).reduce(
        (total, recommendations) => total + recommendations.length,
        0,
      )
    : 0;

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
            Atención en mostrador
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold sm:text-4xl">
            Consulta rápida
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#1F1F1F]/60">
            Buscá un producto puntual o guiá una recomendación según lo que busca el cliente.
          </p>
        </div>

        <ModeNavigation mode={mode} />

        {catalog.error ? (
          <p
            role="alert"
            className="mt-6 border border-[#A33A2B]/20 bg-[#A33A2B]/10 p-4 text-sm font-semibold text-[#8B2F24]"
          >
            {catalog.error}
          </p>
        ) : null}

        {mode === "search" ? (
          <QuickCatalogView products={catalog.data} params={params} />
        ) : (
          <>
            <PerfumeRecommendationForm preferences={preferences} />

            {!hasPreferences ? (
              <div className="mt-6 border border-[#556B2F]/20 bg-white/75 p-6">
                <h2 className="text-xl font-semibold">
                  Empezá por lo que el cliente ya sabe
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#1F1F1F]/60">
                  Elegí una preferencia, un estilo, una ocasión o un presupuesto. No hace falta completar todo para encontrar buenas opciones.
                </p>
              </div>
            ) : recommendationCount === 0 ? (
              <div className="mt-6 border border-[#8B5E3C]/15 bg-white/75 p-8 text-center">
                <h2 className="text-xl font-semibold">
                  No encontramos una opción suficientemente cercana
                </h2>
                <p className="mt-2 text-sm text-[#1F1F1F]/60">
                  Probá quitar un criterio o ampliar el presupuesto para ver más alternativas.
                </p>
              </div>
            ) : recommendationGroups ? (
              <>
                <RecommendationGroup
                  title="Recomendados para empezar"
                  description="Las opciones con mejor afinidad y stock para mostrar primero."
                  recommendations={recommendationGroups.primaryRecommendations}
                  tone="primary"
                />
                <RecommendationGroup
                  title="Otras opciones que pueden encajar"
                  description="Alternativas disponibles para ampliar la conversación."
                  recommendations={recommendationGroups.secondaryRecommendations}
                  tone="secondary"
                />
                <RecommendationGroup
                  title="También existe, pero ahora está sin stock"
                  description="Referencias útiles sin disponibilidad inmediata."
                  recommendations={recommendationGroups.unavailableRecommendations}
                  tone="unavailable"
                />
                <RecommendationGroup
                  title="Probalo antes con un decant"
                  description="Opciones de prueba separadas de los frascos completos."
                  recommendations={recommendationGroups.decantRecommendations}
                  tone="decant"
                />
              </>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
