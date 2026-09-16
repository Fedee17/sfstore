import Link from "next/link";

import {
  GetNavigationForm,
  GetNavigationSubmitButton,
} from "@/components/admin/get-navigation-form";
import {
  PERFUME_GENDER_OPTIONS,
  PERFUME_INTENSITY_OPTIONS,
  PERFUME_OCCASION_OPTIONS,
  PERFUME_OLFACTORY_FAMILY_OPTIONS,
} from "@/lib/catalog/attribute-config";
import type { PerfumeRecommendationPreferences } from "@/lib/catalog/perfume-recommendation";

type PerfumeRecommendationFormProps = {
  preferences: PerfumeRecommendationPreferences;
};

function MultiChoice({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: readonly { label: string; value: string }[];
  selected: string[];
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-xs font-semibold uppercase text-[#8B5E3C]">
        {legend}
      </legend>
      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 text-sm font-semibold text-[#1F1F1F]/75 transition has-[:checked]:border-[#556B2F] has-[:checked]:bg-[#556B2F]/10 has-[:checked]:text-[#465826] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#556B2F]"
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selected.includes(option.value)}
              className="size-4 accent-[#556B2F]"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PerfumeRecommendationForm({
  preferences,
}: PerfumeRecommendationFormProps) {
  return (
    <GetNavigationForm
      className="mt-6 border border-[#8B5E3C]/15 bg-white/85 p-4 shadow-sm sm:p-5"
    >
      <input type="hidden" name="mode" value="recommend" />

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <label className="grid min-w-0 gap-2">
          <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
            Género / preferencia
          </span>
          <select
            name="gender"
            defaultValue={preferences.gender ?? ""}
            className="h-12 min-w-0 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 outline-none focus:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
          >
            <option value="">Sin preferencia</option>
            {PERFUME_GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2">
          <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
            Intensidad
          </span>
          <select
            name="intensity"
            defaultValue={preferences.intensity ?? ""}
            className="h-12 min-w-0 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3 outline-none focus:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
          >
            <option value="">Sin preferencia</option>
            {PERFUME_INTENSITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2">
          <span className="text-xs font-semibold uppercase text-[#8B5E3C]">
            Presupuesto máximo
          </span>
          <input
            name="budget"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            defaultValue={preferences.maxTransferPrice ?? ""}
            placeholder="$60.000"
            className="h-12 min-w-0 rounded-md border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
          />
        </label>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <MultiChoice
          legend="Familia o estilo olfativo"
          name="family"
          options={PERFUME_OLFACTORY_FAMILY_OPTIONS}
          selected={preferences.olfactoryFamilies ?? []}
        />
        <MultiChoice
          legend="Ocasión"
          name="occasion"
          options={PERFUME_OCCASION_OPTIONS}
          selected={preferences.occasions ?? []}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-[#8B5E3C]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#1F1F1F]/55">
          Elegí solo lo que el cliente ya tenga claro. El resto puede quedar vacío.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/consulta?mode=recommend"
            className="flex min-h-11 items-center justify-center rounded-md border border-[#8B5E3C]/20 px-4 text-sm font-semibold text-[#8B5E3C] hover:bg-[#F7F4ED] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F]"
          >
            Limpiar
          </Link>
          <GetNavigationSubmitButton
            pendingLabel="Recomendando..."
            className="min-h-11 rounded-md bg-[#556B2F] px-5 text-sm font-semibold text-white transition hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Ver recomendaciones
          </GetNavigationSubmitButton>
        </div>
      </div>
    </GetNavigationForm>
  );
}
