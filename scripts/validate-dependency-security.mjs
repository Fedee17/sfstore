import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Only suites previously verified to run without services or database writes.
// Real Supabase suites require a separate, explicitly authorized local harness.
const excludes = [
  'real-local', 'staging-functional', 'atomic-checkout',
  'sec01-pay01-integration', 'guest-shipping-browser',
  'atomic-product-save.test.mjs', 'product-form-atomic-ui',
  'product-storage-task-processor', 'sec01-effective-permissions',
];
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith('SFSTORE_REAL_LOCAL_') || key.startsWith('SFSTORE_TEST_')) delete env[key];
}
const files = readdirSync('tests').filter(name =>
  name.endsWith('.test.mjs') && !excludes.some(excluded => name.includes(excluded)),
).sort().map(name => 'tests/' + name);
console.log('Running ' + files.length + ' synthetic regression files without service opt-ins.');
const result = spawnSync(process.execPath, ['--test', ...files], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
