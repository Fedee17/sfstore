import * as pricing from '../../lib/pricing.ts';
import * as families from '../../lib/products/public-families.ts';
import * as web from '../../lib/web-transfer-pricing.ts';
import * as commercialPricing from '../../lib/products/commercial-pricing.ts';
import { analyticsRenderStubs } from './analytics-render-stubs.mjs';
import { readFileSync } from 'node:fs';

export function loadPerfumeAccords(load) {
  return load('lib/products/perfume-accords.ts', {
    './perfume-accords-research.json': { default: JSON.parse(readFileSync(new URL('../../lib/products/perfume-accords-research.json', import.meta.url), 'utf8')) },
  });
}

export function loadCommercialInformation(load, attributes) {
  return load("lib/products/commercial-information.ts", {
    ...attributes,
    "./perfume-brand-research.json": { default: JSON.parse(readFileSync(new URL("../../lib/products/perfume-brand-research.json", import.meta.url), "utf8")) },
    "./perfume-notes-research.json": { default: JSON.parse(readFileSync(new URL("../../lib/products/perfume-notes-research.json", import.meta.url), "utf8")) },
  });
}

export function loadProductDetailUi(load, overrides = {}) {
  const config = load('lib/catalog/attribute-config.ts');
  const attributes = { '@/lib/catalog/attribute-config': config, './perfume-accords': loadPerfumeAccords(load) };
  const commercial = loadCommercialInformation(load, attributes);
  const styles = { "./perfume-information.module.css": { default: {} } };
  const accordion = load("components/product-accordion.tsx");
  const perfume = load("components/perfume-information.tsx", { ...styles, "./product-accordion": accordion });
  const modules = {
    ...analyticsRenderStubs,
    './product-detail.module.css': { default: {} },
    ...attributes,
    '@/lib/products/commercial-information': commercial,
    '@/lib/product-taxonomy': load('lib/product-taxonomy.ts', attributes),
    '@/lib/products/public-families': families,
    '@/lib/pricing': pricing,
    '@/lib/web-transfer-pricing': web,
    '@/lib/products/commercial-pricing': commercialPricing,
    '@/components/decant-shipping-preview': { DecantShippingPreview: () => null },
    './product-accordion': accordion,
    './perfume-information': perfume,
    ...overrides,
  };
  modules["@/lib/products/payment-prices"] = load("lib/products/payment-prices.ts", modules);
  modules["./product-price-panel"] = load("components/product-price-panel.tsx", { ...modules, "./product-price-panel.module.css": { default: {} } });
  const information = load('components/product-information.tsx', modules);
  return {
    ...modules,
    '@/components/product-price-options': load('components/product-price-options.tsx', modules),
    '@/components/product-information': information,
    '@/components/product-detail-layout': load('components/product-detail-layout.tsx', {
      ...modules,
      './product-information': information,
    }),
    '@/components/product-purchase-summary': load('components/product-purchase-summary.tsx', modules),
  };
}
