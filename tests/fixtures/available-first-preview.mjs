// Local synthetic GET-only catalog for P07. Never reads project/Production credentials.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { publicRows, fixtureId, startPublicFixtureServer } from './search-public-catalog.mjs';

const root = process.cwd();
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local']) {
  assert.equal(existsSync(resolve(root, file)), false, 'REFUSE_RUNTIME_ENV_FILE');
}
const attributes = family => [{ name: 'commercial_category', value: 'arabe' }, { name: 'olfactory_family', value: family }];
const perfume = publicRows.find(row => row.category_slug === 'perfumes');
const mate = publicRows.find(row => row.category_slug === 'mates');
const rows = publicRows.map(row => ({ ...row,
  stock: row.slug === 'cable-cc-prueba' || row.slug === 'termo-negro-prueba' ? 0 : row.stock,
  product_attributes: row === perfume ? attributes('dulce') : row.product_attributes,
}));
rows.push(
  { ...perfume, id: fixtureId(31), slug: 'agotado-destacado-prueba', name: 'Agotado destacado PRUEBA', stock: 0, featured: true, product_attributes: attributes('dulce') },
  { ...perfume, id: fixtureId(32), slug: 'consulta-precio-prueba', name: 'Consulta precio PRUEBA', price: 0, product_attributes: attributes('dulce') },
  { ...perfume, id: fixtureId(33), slug: 'disponible-destacado-prueba', name: 'Disponible destacado PRUEBA', featured: true, product_attributes: attributes('fresco') },
  { ...mate, id: fixtureId(34), slug: 'mate-agotado-prueba', name: 'Mate agotado PRUEBA', stock: 0, featured: true },
);
const fixture = await startPublicFixtureServer({ rows });
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-p07-no-privileges', CHECKOUT_GUEST_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1' });
const args = process.argv.includes('--build') ? ['build', '--webpack'] : ['dev', '--hostname', '127.0.0.1', '--port', '3156', '--webpack'];
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
  console.log(JSON.stringify({ status: 'P07_LOCAL_CLOSED', requests: fixture.requests.length, writes: fixture.requests.filter(r => r.method !== 'GET').length }));
}
process.once('SIGINT', () => stop().then(() => process.exit(0)));
process.once('SIGTERM', () => stop().then(() => process.exit(0)));
child.once('exit', code => { process.exitCode = code ?? 1; stop(); });
console.log(JSON.stringify({ localOnly: true, origin: 'http://127.0.0.1:3156', syntheticRows: rows.length }));
