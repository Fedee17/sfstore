// Synthetic public-view responses; no database, credentials or Production data.
import { createServer } from 'node:http';

export const fixtureId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function row(n, name, slug, category = 'electronica', extra = {}) {
  return {
    id: fixtureId(n), name, slug, short_description: 'Artículo sintético para validar búsqueda.',
    description: 'Datos de prueba, no disponibles para compras reales.', price: 100, stock: 2,
    featured: false, status: 'active', historical_identity: false, category_id: fixtureId(200),
    category_slug: category, categories: { id: fixtureId(200), name: category, slug: category, is_active: true },
    product_images: [], product_attributes: [], ...extra,
  };
}
export const publicRows = [
  row(1, 'Perfume Ámbar PRUEBA', 'perfume-ambar-prueba', 'perfumes'),
  row(2, 'Mate imperial PRUEBA', 'mate-imperial-prueba', 'mates'),
  row(3, 'Termo de acero PRUEBA', 'termo-acero-prueba', 'termos'),
  row(4, 'Cabezal iPhone PRUEBA', 'cabezal-prueba', 'electronica', { price: 22000 }),
  row(5, 'Cable USB-C a USB-C PRUEBA', 'cable-cc-prueba', 'electronica', { price: 15800 }),
  row(6, 'Cable USB-C a Lightning PRUEBA', 'cable-lightning-prueba', 'electronica', { price: 15800 }),
  row(7, 'Lámpara PRUEBA', 'lampara-prueba', 'categoria-nueva-sin-registro'),
  ...['Negro', 'Gris'].map((color, i) => row(8 + i, `Termo familiar ${color} PRUEBA`, `termo-${color.toLowerCase()}-prueba`, 'termos', {
    family_id: fixtureId(50), family_name: 'Termo familiar PRUEBA', family_slug: 'termo-familiar-prueba',
    variant_options: { Color: color }, sku: `PRUEBA-${color}`, price: 46666.67,
  })),
];
export const publicOffers = ['cc', 'lightning'].map(connector => ({
  id: fixtureId(100), name: 'Receta sintética', connector, presentation_product: fixtureId(101),
  head_slug: 'cabezal-prueba', cable_slug: `cable-${connector}-prueba`,
  combo_list_price: '30666.67', combo_transfer_price: '23000.00', price_version: 'synthetic-v1',
}));
export const invalidRows = [
  row(20, 'ARCHIVADO NO PUBLICAR', 'archivado', 'electronica', { status: 'archived' }),
  row(21, 'BORRADOR NO PUBLICAR', 'borrador', 'electronica', { status: 'draft' }),
  row(22, 'HISTORICO NO PUBLICAR', 'historico', 'electronica', { historical_identity: true }),
  row(23, 'CATEGORIA INACTIVA NO PUBLICAR', 'inactivo', 'electronica', {
    categories: { id: fixtureId(201), slug: 'electronica', name: 'Electrónica', is_active: false },
  }),
];

export function filterFixtureRows(rows, params) {
  let result = [...rows].sort((a, b) => a.id.localeCompare(b.id) || (a.connector ?? '').localeCompare(b.connector ?? ''));
  for (const [key, value] of params) {
    if (key === 'or') {
      const match = /id.gt.([^,]+),and\(id.eq.[^,]+,connector.gt.([^)]*)\)/.exec(value);
      if (!match) throw new Error('UNSUPPORTED_FIXTURE_FILTER');
      result = result.filter(r => r.id > match[1] || (r.id === match[1] && r.connector > match[2]));
    } else if (value.startsWith('eq.')) result = result.filter(r => String(r[key]) === value.slice(3));
    else if (value.startsWith('gt.')) result = result.filter(r => String(r[key]) > value.slice(3));
    else if (value.startsWith('in.(')) {
      const values = value.slice(4, -1).split(',').map(s => s.replaceAll('"', ''));
      result = result.filter(r => values.includes(String(r[key])));
    }
  }
  // Deliberately clamp every response to exercise the real cursor pagination.
  return result.slice(0, 1);
}

export async function startPublicFixtureServer() {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    requests.push({ method: req.method, path: url.pathname });
    const table = url.pathname.split('/').at(-1);
    if (req.method !== 'GET' || !['public_catalog_skus', 'public_component_offers'].includes(table)) {
      res.writeHead(405); res.end('FIXTURE_READ_ONLY'); return;
    }
    const data = filterFixtureRows(table === 'public_catalog_skus' ? publicRows : publicOffers, url.searchParams);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}
