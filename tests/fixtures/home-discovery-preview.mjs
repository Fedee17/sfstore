// Local synthetic GET-only catalog for the homepage. Never reads project/Production credentials.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { publicRows, fixtureId, startPublicFixtureServer } from './search-public-catalog.mjs';

const root = process.cwd();
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local']) {
  assert.equal(existsSync(resolve(root, file)), false, 'REFUSE_RUNTIME_ENV_FILE');
}
// Existing product photographs are referenced read-only, paired with their actual product names.
// Every ID, stock, description and price below is synthetic; no Production keys or API calls.
const base = publicRows.find(row => row.category_slug === 'perfumes');
const image = (id, file, name) => [{ id: fixtureId(id + 300), url: `https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/${file}`, alt: name, is_primary: true, sort_order: 0 }];
const examples = [
  ['Al Haramain dubai night', '66c152aa-98db-4827-b4c7-fdc2721da2a6/1789227676837-0-3f6799b0-aca5-4b2a-ba06-cb1d7f0e4b65-optimizada.webp'],
  ['French Avenue Liquid Brun', '6ca63ce3-5694-418f-90a8-5d8043f4c2f5/1789601319065-0-37e6f25d-987d-4ebd-9f61-cb46a2aaf76f-optimizada.webp'],
  ['Decant hawas elixir', '2db67b25-6e37-446a-8e98-5f626d5efc63/1781484221250-img-0191-optimizada.webp'],
];
const genderAttributes = gender => [{ name: 'commercial_category', value: 'arabe' }, { name: 'gender', value: gender }];
const rows = [...publicRows.map((row,i)=>i === 0 ? {...row,product_attributes:genderAttributes('femenino')} : row), ...examples.map(([name, file], i) => ({ ...base, id: fixtureId(31 + i), name: name + ' · PRUEBA', slug: 'home-photo-' + i, featured: true, price: 10000, stock: 2, short_description: 'Contenido de prueba local. No es una oferta comercial.', product_images: image(31 + i, file, name), product_attributes: genderAttributes('masculino') }))];
rows.push({ ...base, id: fixtureId(34), name: 'Agotado destacado PRUEBA', slug: 'home-empty', stock: 0, featured: true });
rows.push({ ...base, id: fixtureId(35), name: 'Consulta precio PRUEBA', slug: 'home-no-price', price: 0, featured: true });
const fixture = await startPublicFixtureServer({ rows });
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-home-no-privileges', CHECKOUT_GUEST_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1' });
const args = process.argv.includes('--build') ? ['build', '--webpack'] : ['dev', '--hostname', '127.0.0.1', '--port', '3157', '--webpack'];
const child = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), ...args], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
let closing = false;
async function stop() {
  if (closing) return; closing = true;
  if (child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  fixture.server.closeAllConnections(); await new Promise(resolve => fixture.server.close(resolve));
  console.log(JSON.stringify({ status: 'HOME_LOCAL_CLOSED', requests: fixture.requests.length, writes: fixture.requests.filter(r => r.method !== 'GET').length }));
}
process.once('SIGINT', () => stop().then(() => process.exit(0)));
process.once('SIGTERM', () => stop().then(() => process.exit(0)));
child.once('exit', code => { process.exitCode = code ?? 1; stop(); });
console.log(JSON.stringify({ localOnly: true, origin: 'http://127.0.0.1:3157', syntheticRows: rows.length }));
