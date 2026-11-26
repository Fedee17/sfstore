import { useId } from "react";
import type { getProductCommercialInformation } from "@/lib/products/commercial-information";
import { ProductAccordion } from "./product-accordion";
import styles from "./perfume-information.module.css";

type Information = ReturnType<typeof getProductCommercialInformation>;

const noteLevels = [
  { label: "Notas de salida", name: "Salida", shape: styles.top, outline: "M.45 .06 Q.5 -.04 .55 .06 L.97 .89 Q1.04 1 .92 1 H.08 Q-.04 1 .03 .89 Z" },
  { label: "Notas de corazón", name: "Corazón", shape: styles.heart, outline: "M.26 0 H.74 Q.79 0 .81 .1 L.98 .86 Q1.02 1 .93 1 H.07 Q-.02 1 .02 .86 L.19 .1 Q.21 0 .26 0 Z" },
  { label: "Notas de fondo", name: "Fondo", shape: styles.base, outline: "M.18 0 H.82 Q.86 0 .88 .13 L.99 .86 Q1.02 1 .95 1 H.05 Q-.02 1 .01 .86 L.12 .13 Q.14 0 .18 0 Z" },
];

const noteImages: Readonly<Record<string, string>> = {
  caramelo: "caramelo",
  vainilla: "vainilla",
  "flores blancas": "flores-blancas",
  bergamota: "bergamota",
  jazmin: "flores-blancas",
  citricos: "citricos",
  menta: "menta",
  lavanda: "lavanda",
  cedro: "cedro",
  rosa: "rosa",
  "frutos rojos": "frutos-rojos",
  ambar: "ambar",
};

const chipIllustrations: Readonly<Record<string, string>> = {
  "lima": "chip-lima",
  "romero": "chip-romero",
  "manzana verde": "chip-manzana-verde",
  "mango": "chip-mango",
  "maracuya": "chip-maracuya",
  "datiles": "chip-datiles",
  "chocolate amargo": "chip-chocolate-amargo",
  "nuez moscada": "chip-nuez-moscada",
  "tabaco": "chip-tabaco",
  "ciruela": "chip-ciruela",
  "cafe": "chip-cafe",
  "salvia": "chip-salvia",
  "salvia esclarea": "chip-salvia-esclarea",
  "salvia esclarea francesa": "chip-salvia-esclarea",
  "notas marinas": "chip-notas-marinas",
  "acorde marino": "chip-notas-marinas",
  "notas minerales": "chip-notas-minerales",
  "ambar mineral": "chip-notas-minerales",
  "jazmin de egipto": "chip-jazmin-de-egipto",
  "lavandin": "lavanda",
  "cacao": "chip-cacao",
  "te verde": "chip-te-verde",
  "te negro chino": "chip-te-negro-chino",
  "gardenia": "chip-gardenia",
  "granada": "chip-granada",
  "frutas tropicales": "chip-frutas-tropicales",
  "muguete": "chip-muguete",
  "golosina efervescente de frutilla": "chip-golosina-frutilla",
  "oud": "chip-oud",
  "vetiver": "chip-vetiver",
  "bergamota de calabria": "bergamota",
  "naranja siciliana": "chip-naranja",
  "jengibre de nigeria": "chip-jengibre",
  "canela de ceilan": "chip-canela",
  "vainilla bourbon": "chip-vainilla",
  "raiz de iris": "chip-raiz-de-iris",
  "haba tonka": "chip-haba-tonka",
  "rosa de damasco": "chip-rosa-de-damasco",
  "pimienta negra": "chip-pimienta-negra",
  "orris / raiz de iris": "chip-raiz-de-iris",
  "vainilla de madagascar": "chip-vainilla",
  "almizcle blanco": "chip-almizcle",
  "cedro de virginia": "cedro",
  "caramelo": "chip-caramelo",
  "leche": "chip-leche",
  "vainilla": "chip-vainilla",
  "praline": "chip-praline",
  "agua de coco": "chip-agua-de-coco",
  "anana": "chip-anana",
  "azafran": "chip-azafran",
  "durazno": "chip-durazno",
  "flor de azahar": "chip-flor-de-azahar",
  "higo": "chip-higo",
  "hoja de higuera": "chip-hoja-de-higuera",
  "iris": "chip-iris",
  "jazmin de la india": "chip-jazmin-de-la-india",
  "lichi": "chip-lichi",
  "naranja": "chip-naranja",
  "nardo": "chip-nardo",
  "sandalo": "chip-sandalo",
  "frambuesa": "chip-frambuesa",
  "cassis": "chip-cassis",
  "pera": "chip-pera",
  "almizcle": "chip-almizcle",
  "limon": "chip-limon",
  "maderas": "chip-maderas",
  "mandarina": "chip-mandarina",
  "pimienta rosa": "chip-pimienta-rosa",
  "pomelo": "chip-pomelo",
  "canela": "chip-canela",
  "cardamomo": "chip-cardamomo",
  "violeta": "chip-violeta",
  "manzana": "chip-manzana",
  "jengibre": "chip-jengibre",
  "pachuli": "chip-pachuli",
  "miel": "chip-miel",
  "coco": "chip-coco",
  "azucar": "chip-azucar",
};

export function noteChipImage(key: string) {
  return Object.hasOwn(chipIllustrations, key) ? chipIllustrations[key] : undefined;
}

const noteCompositions = [
  { notes: ["caramelo", "vainilla", "leche"], asset: "caramelo-vainilla-leche" },
  { notes: ["pomelo", "menta", "cedro"], asset: "pomelo-menta-cedro" },
  { notes: ["bergamota", "jazmin", "vainilla"], asset: "bergamota-jazmin-vainilla" },
] as const;

export function noteKeys(values: readonly string[]) {
  return values.flatMap(value => value.split(/[,;·]|\s+y\s+/iu)).map(note =>
    note.trim().replace(/\.$/u, "").toLocaleLowerCase("es-AR").normalize("NFD").replace(/\p{Diacritic}/gu, ""));
}

export function noteImage(values: readonly string[]) {
  const keys = noteKeys(values);
  return keys.map(key => Object.hasOwn(noteImages, key) ? noteImages[key] : undefined).find(Boolean)
    ?? keys.map(noteChipImage).find(Boolean);
}

export function separateCatalogNotes(description: string) {
  // Some catalog entries store the verified stages as a labeled description paragraph.
  const paragraphs = description.split("\n\n");
  for (const [index, paragraph] of paragraphs.entries()) {
    const block = /^(?:Notas verificadas|Notas olfativas)( \(selección parcial\))?\s*\n\s*([\s\S]+)$/iu.exec(paragraph);
    if (!block) continue;

    const stages = [...block[2].matchAll(/(?:^|\s)(Salida|Corazón|Fondo):\s*([\s\S]+?)(?=\s+(?:Salida|Corazón|Fondo):|$)/giu)];
    if (!stages.length || stages[0].index !== 0) continue;

    const fields = stages.map(([, name, value]) => ({
      label: "Notas de " + name.toLocaleLowerCase("es-AR"),
      values: [value.trim().replace(/\.$/u, "")],
    }));
    if (new Set(fields.map(field => field.label)).size !== fields.length ||
      fields.some(field => !field.values[0] || /\.\s/u.test(field.values[0]))) continue;

    return {
      description: paragraphs.filter((_, position) => position !== index).join("\n\n"),
      fields,
      partial: Boolean(block[1]),
    };
  }
  const explicitStages = /(?:^|\s)Notas de salida:\s*([^.!?]+)\.\s*Corazón:\s*([^.!?]+)\.\s*Fondo:\s*([^.!?]+)\.?/iu.exec(description);
  if (explicitStages) {
    return {
      description: description.replace(explicitStages[0], "").trim(),
      fields: noteLevels.map((level, index) => ({ label: level.label, values: [explicitStages[index + 1].trim()] })),
      partial: false,
    };
  }
  const declared = /(?:^|\n\n)Notas principales declaradas por la marca:\s*([^.!?]+)\.?/iu.exec(description);
  if (declared) {
    return {
      description: description.replace(declared[0], "").trim(),
      fields: [{ label: "Notas", values: [declared[1].trim()] }],
      partial: true,
    };
  }
  return { description, fields: [], partial: false };
}

const perfumeIcons = {
  profile: <><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M10 7v4a8 8 0 0 0-6 8l2 2h12l2-2a8 8 0 0 0-6-8V7M5 16h14" /></>,
  occasions: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M8 14h.01m4 0h.01m4 0h.01M8 17h.01m4 0h.01m4 0h.01" /></>,
  notes: <path d="M5 17c-4-7 4-12 15-13-1 10-6 18-13 15M3 22l11-12" />,
};

function PerfumeIcon({ icon }: { icon: keyof typeof perfumeIcons }) {
  return <svg className={styles.perfumeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {perfumeIcons[icon]}
  </svg>;
}

function PerfumeNotes({ fields, partial }: {
  fields: Information["fields"];
  partial: boolean;
}) {
  const pyramidId = useId();
  const levels = noteLevels.flatMap(level => {
    const values = fields.find(field => field.label === level.label)?.values;
    return values?.length ? [{ ...level, values }] : [];
  });
  const general = fields.find(field => field.label === "Notas")?.values;
  if (!levels.length && !general?.length) return null;
  const illustrated = levels.length > 1;

  return <section className={styles.notes} aria-label="Notas olfativas">
    <h3 className={styles.sectionTitle}><PerfumeIcon icon="notes" />Notas olfativas</h3>
    {partial ? <p className={styles.selection}>Selección parcial</p> : null}
    <ul className={styles.notesList}>
      {levels.map(level => {
        const visual = illustrated ? noteImage(level.values) : undefined;
        const clipId = `${pyramidId}-${level.name.normalize("NFD").replace(/\p{Diacritic}/gu, "")}`;
        return <li key={level.name} className={illustrated ? styles.levelRow : undefined}>
          {illustrated ? <div className={styles.pyramidTier} aria-hidden="true">
            <div className={level.shape} style={{ clipPath: `url("#${clipId}")` }}>
              <svg width="0" height="0" className={styles.clipDefinition}>
                <clipPath id={clipId} clipPathUnits="objectBoundingBox"><path d={level.outline} /></clipPath>
              </svg>
              {visual ? <NotePhoto asset={visual} /> : null}
            </div>
          </div> : null}
          <div className={styles.noteRow}>
            <span>{level.name}</span><span>{level.values.join(" · ")}</span>
          </div>
        </li>;
      })}
      {general?.length ? <li className={styles.noteRow}>
        <span>Notas</span><span>{general.join(" · ")}</span>
      </li> : null}
    </ul>
  </section>;
}

function NotePhoto({ asset }: { asset: string }) {
  // Decorative, locally optimized WebP artwork, separate from the catalog photo.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/perfume-notes/${asset}.webp`} alt="" loading="lazy" decoding="async" />;
}

export function PerfumeAccords({ document }: { document: Information["accords"] }) {
  if (!document?.accords.length) return null;
  const measured = document.method === "source-bar-width";
  return <section className={styles.accordsSection} aria-label="Acordes principales">
    <div className={styles.accords}>
      <h3 className={styles.accordsHeading}>
        <span className={styles.accordsIcon} aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M8 21v6m8-15v24m8-31v38m8-31v24m8-15v6" /></svg></span>
        <span>Acordes<br />principales</span>
      </h3>
      <ul className={measured ? styles.accordsList : styles.accordsLabels}>
        {document.accords.map(accord => <li key={accord.label}>
          <span>{accord.label}</span>
          {measured && accord.relativeStrength !== undefined ? <>
            <span className={styles.accordTrack} aria-hidden="true"><span style={{ width: `${accord.relativeStrength}%` }} /></span>
            <span className="sr-only">Predominancia relativa orientativa: {accord.relativeStrength} sobre 100, según el gráfico de la fuente.</span>
          </> : null}
        </li>)}
      </ul>
    </div>
    <p className={styles.accordsSource}>
      {measured ? "Predominancia olfativa orientativa. No indica duración ni proyección. " : "Acordes documentados, sin predominancia cuantificada. "}
      <a href={document.sourceUrl}>Fuente</a> · Consulta: {document.consultedAt.split("-").reverse().join("/")}
    </p>
  </section>;
}

export function PerfumeInformation({ name, information }: {
  name?: string;
  photo?: string | null;
  information: Information;
}) {
  const { fields, shortDescription, notesSource } = information;
  const catalogNotes = separateCatalogNotes(information.description);
  const recommendationPattern = /^(?:Te lo recomendamos|Si (?:buscás|preferís|te gustan|disfrutás)|Para quienes)\b/iu;
  const summary = shortDescription || catalogNotes.description.split(/\n\s*\n/u)[0];
  const hasRecommendation = summary.split(/(?<=[.!?])\s+/u).some(sentence => recommendationPattern.test(sentence));
  const recommendation = hasRecommendation ? undefined : catalogNotes.description.split(/(?<=[.!?])\s+/u)
    .map(sentence => sentence.trim()).find(sentence => recommendationPattern.test(sentence));
  const notes = fields.filter(field => field.label.startsWith("Notas"));
  const documentedNotes = notesSource ? notes : [...notes, ...catalogNotes.fields.filter(field =>
    !notes.some(note => note.label === field.label))];
  const brand = fields.find(field => field.label === "Marca")?.values[0];
  const profile = fields.find(field => field.label === "Perfil olfativo")?.values;
  const intensity = fields.find(field => field.label === "Intensidad orientativa")?.values;
  const occasions = fields.find(field => field.label === "Ocasiones sugeridas")?.values;
  const extra = fields.filter(field => ["Contenido", "Presentación"].includes(field.label));
  const presentation = /^Presentación: (.+?)\.?$/imu.exec(catalogNotes.description)?.[1];
  if (presentation && !extra.some(field => field.label === "Presentación")) {
    extra.push({ label: "Presentación", values: [presentation] });
  }
  const hasNotes = documentedNotes.some(field => field.values.length);
  const supplementalCopy = !hasNotes && !recommendation && shortDescription
    ? catalogNotes.description.split(/\n\s*\n/u).find(paragraph => paragraph && !/^Presentación:/iu.test(paragraph))
    : undefined;
  const keys = new Set(noteKeys(documentedNotes.flatMap(field => field.values)));
  const composition = noteCompositions.find(visual => visual.notes.every(note => keys.has(note)));
  const existingVisuals = [...keys].map(key => Object.hasOwn(noteImages, key) ? noteImages[key] : undefined).filter(asset => asset !== undefined);
  const visuals = composition ? [composition.asset] : [...new Set(
    existingVisuals.length ? existingVisuals : [...keys].flatMap(key => noteChipImage(key) ?? []),
  )].slice(0, 3);
  const title = brand && name?.toLocaleLowerCase("es-AR").startsWith(brand.toLocaleLowerCase("es-AR") + " ")
    ? name.slice(brand.length).trim() : name;

  return <ProductAccordion title="Sobre este producto" icon="information" open classes={{ panel: styles.panel, summary: styles.summary, content: styles.content }}>
    {title || brand || summary || visuals.length ? <header className={styles.intro}>
      <div className={styles.copy}>
        {brand ? <p className={styles.brand}>{brand}</p> : null}
        {title ? <h2>{title}</h2> : null}
        {summary ? <p className={styles.description}>{summary}</p> : null}
        {recommendation ? <p className={styles.recommendation}>{recommendation}</p> : null}
        {supplementalCopy ? <p className={styles.description}>{supplementalCopy}</p> : null}
      </div>
      {visuals.length ? <div className={styles.art} aria-hidden="true">
        {visuals.map(asset => <NotePhoto key={asset} asset={asset} />)}
      </div> : null}
    </header> : null}
    {profile || intensity || occasions ? <div className={styles.highlights}>
      {profile || intensity ? <div>
        <PerfumeIcon icon="profile" />
        <dl>
          {profile ? <div><dt>Perfil olfativo</dt><dd>{profile.join(" · ")}</dd></div> : null}
          {intensity ? <div className={styles.intensity}>
            <dt>Intensidad orientativa</dt><dd>{intensity.join(" · ")}</dd>
          </div> : null}
        </dl>
      </div> : null}
      {occasions ? <div className={styles.occasions}>
        <PerfumeIcon icon="occasions" />
        <dl><dt>Ideal para</dt><dd>{occasions.join(" · ")}</dd></dl>
      </div> : null}
    </div> : null}
    <PerfumeNotes fields={documentedNotes} partial={catalogNotes.partial} />
    <PerfumeAccords document={information.accords} />
    {extra.length ? <dl aria-label="Características del producto" className={styles.extra}>
      {extra.map(field => <div key={field.label}>
        <dt>{field.label}</dt><dd>{field.values.join(" · ")}</dd>
      </div>)}
    </dl> : null}
  </ProductAccordion>;
}
