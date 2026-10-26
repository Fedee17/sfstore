// Local visual fixture only: GET-only synthetic REST, no SQL or real credentials.
// Run from this worktree with: node tests/fixtures/mobile-navigation-preview.mjs [--build]
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { publicRows, fixtureId, startPublicFixtureServer } from './search-public-catalog.mjs';

const root = process.cwd();
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  assert.equal(existsSync(resolve(root, file)), false, 'REFUSE_RUNTIME_ENV_FILE');
}
const perfume = publicRows.find(row => row.category_slug === 'perfumes');
const attrs = (family, intensity) => [{name:'commercial_category',value:'arabe'},{name:'olfactory_family',value:family},{name:'intensity',value:intensity}];
const rows = publicRows.map(row => row === perfume ? {...row, product_attributes:attrs('ambarado','intensa')} : row);
rows.push({...perfume,id:fixtureId(31),name:'Perfume fresco PRUEBA',slug:'perfume-fresco-prueba',product_attributes:attrs('fresco','suave')});
rows.push({...perfume,id:fixtureId(32),name:'Perfume disenador PRUEBA',slug:'perfume-disenador-prueba',product_attributes:[{name:'commercial_category',value:'disenador'}]});
const fixture = await startPublicFixtureServer({rows});
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {
  NEXT_PUBLIC_SUPABASE_URL: fixture.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-fixture-no-privileges',
  CHECKOUT_GUEST_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1',
});
// Synthetic ID only. The P06 browser test intercepts ALL Google traffic locally.
if (process.argv.includes('--analytics')) Object.assign(env, {
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-SYNTHETIC',
  NEXT_PUBLIC_GA4_SITE_ORIGIN: 'http://127.0.0.1:3153',
});
const buildOnly = process.argv.includes('--build');
const args = buildOnly ? ['build', '--webpack'] : ['dev', '--hostname', '127.0.0.1', '--port', '3153', '--webpack'];
const child = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), ...args], {
  cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  if (child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  fixture.server.closeAllConnections();
  await new Promise(done => fixture.server.close(done));
  console.log(JSON.stringify({ status: 'LOCAL_MOBILE_PREVIEW_CLOSED', requests: fixture.requests.length, writes: fixture.requests.filter(r => r.method !== 'GET').length }));
}
process.once('SIGINT', () => stop().then(() => process.exit(0)));
process.once('SIGTERM', () => stop().then(() => process.exit(0)));
child.once('exit', code => { process.exitCode = code ?? 1; stop(); });
console.log(JSON.stringify({ localOnly: true, base: 'http://127.0.0.1:3153', fixture: fixture.url, productionCredentials: false }));
