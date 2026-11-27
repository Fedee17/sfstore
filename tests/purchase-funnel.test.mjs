// Purchase funnel from the store's own data: sessions per step per day, no visitor data, no cookies.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { FUNNEL_STEPS, FUNNEL_WINDOW_DAYS, isSameOriginBeacon, parseFunnelStep, summarizeFunnel } from '../lib/catalog/purchase-funnel.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611290008_purchase_funnel.sql';

test('only the three browsing steps can be recorded', () => {
  assert.deepEqual(FUNNEL_STEPS, ['product', 'cart', 'checkout']);
  for (const step of FUNNEL_STEPS) assert.equal(parseFunnelStep(step), step);
  for (const raw of ['', 'order', 'PRODUCT', ' product', 'product\n', null, undefined, 3, 'x'.repeat(5000)]) assert.equal(parseFunnelStep(raw), null, String(raw));
});

test('beacons are accepted only from the store itself', () => {
  const req = (headers, url = 'https://sfstore-ten.vercel.app/api/embudo') => new Request(url, { method: 'POST', headers });
  assert.equal(isSameOriginBeacon(req({ origin: 'https://sfstore-ten.vercel.app' })), true);
  assert.equal(isSameOriginBeacon(req({ 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(isSameOriginBeacon(req({ origin: 'https://evil.example' })), false);
  assert.equal(isSameOriginBeacon(req({ 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(isSameOriginBeacon(req({ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' })), false);
  assert.equal(isSameOriginBeacon(req({})), false);
});

test('the summary adds the window and compares each step with the previous one', () => {
  const rows = [
    { day: '2026-11-20', step: 'product', sessions: 80 }, { day: '2026-11-21', step: 'product', sessions: 20 },
    { day: '2026-11-20', step: 'cart', sessions: 25 }, { day: '2026-11-21', step: 'checkout', sessions: 10 },
  ];
  const orders = [{ payment_status: 'paid' }, { payment_status: 'pending' }, { payment_status: 'paid' }, { payment_status: 'cancelled' }];
  const summary = summarizeFunnel(rows, orders);
  assert.deepEqual(summary.steps.map(s => [s.key, s.count, s.fromPrevious]), [
    ['product', 100, null], ['cart', 25, 25], ['checkout', 10, 40], ['order', 4, 40], ['paid', 2, 50],
  ]);
  assert.equal(summary.overall, 2, 'paid orders over sessions that saw a product, in percent');
  assert.equal(summary.days, 2);
});

test('an empty window never divides by zero', () => {
  const summary = summarizeFunnel([], []);
  assert.ok(summary.steps.every(s => s.count === 0 && (s.fromPrevious === null)));
  assert.equal(summary.overall, null);
  assert.ok(FUNNEL_WINDOW_DAYS >= 7);
});

test('the store counts each step once per tab, through the guarded endpoint, never with personal data', () => {
  const client = read('lib/catalog/purchase-funnel-client.ts');
  assert.match(client, /sessionStorage/);
  assert.match(client, /sendBeacon\("\/api\/embudo"/);
  assert.doesNotMatch(client, /localStorage|document\.cookie|userAgent/);
  const route = read('app/api/embudo/route.ts');
  assert.match(route, /isSameOriginBeacon\(request\)/);
  assert.match(route, /isLikelyBot\(/);
  assert.match(route, /parseFunnelStep\(/);
  assert.match(route, /status: 204/);
  assert.doesNotMatch(route, /export async function GET/);
  for (const [file, pattern] of [['components/analytics-view.tsx', /countFunnelStep\(/], ['components/analytics-consent.tsx', /countFunnelStep\("cart"\)/]]) assert.match(read(file), pattern, file);
});

test('the table keeps only daily totals, is capped and only the server can write it', () => {
  const sql = read(migration);
  const code = sql.replace(/^--.*$/gm, '');
  assert.match(code, /create table public\.purchase_funnel_daily/);
  assert.match(code, /step text not null check \(step in \('product', 'cart', 'checkout'\)\)/);
  assert.match(code, /sessions < 100000/);
  assert.match(code, /revoke all on public\.purchase_funnel_daily from public, anon, authenticated, service_role/);
  assert.match(code, /grant execute on function public\.record_purchase_funnel_step\(text\) to service_role/);
  assert.match(code, /delete from public\.purchase_funnel_daily where day < v_day - 180/);
  assert.doesNotMatch(code, /\b(ip|user_agent|visitor|session_id|email)\b/);
  assert.match(read('reports/purchase-funnel-rollback.sql'), /drop table if exists public\.purchase_funnel_daily/);
  const bytes = readFileSync(resolve(root, migration));
  const entry = JSON.parse(read('staging/migration-manifest.json')).applicationOrder.find(e => e.source === migration);
  assert.ok(entry); assert.equal(bytes.includes(13), false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
});
