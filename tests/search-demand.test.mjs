// Store searches without results: aggregated per day, normalized, never personal data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { isLikelyBot, searchDemandOutcome, searchDemandTerm, summarizeSearchDemand, SEARCH_DEMAND_WINDOW_DAYS } from '../lib/catalog/search-demand.ts';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = 'supabase/migrations/202611290002_search_demand.sql';

test('terms are normalized like the store search', () => {
  assert.equal(searchDemandTerm('  Termo  STANLEY   1,4 L '), 'termo stanley 1 4 l');
  assert.equal(searchDemandTerm('Bombílla de ACERO!!'), 'bombilla de acero');
  assert.equal(searchDemandTerm('Yerba-mate'), 'yerba-mate');
});

test('anything that could be personal data or noise is never stored', () => {
  for (const raw of ['a', '', '   ', 'juan@mail.com', '1155667788', 'dni 30123456', '4509 9535 6623 3704', 'https://x.com', 'www.algo.com', 'x'.repeat(61)]) {
    assert.equal(searchDemandTerm(raw), null, raw);
  }
  assert.equal(searchDemandTerm('termo 12345'), 'termo 12345', 'short numbers like models or sizes are kept');
});

test('only searches without exact results are recorded', () => {
  assert.equal(searchDemandOutcome(0, false), 'none');
  assert.equal(searchDemandOutcome(3, true), 'approximate');
  assert.equal(searchDemandOutcome(3, false), null);
});

test('crawlers and empty user agents are skipped', () => {
  assert.equal(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(isLikelyBot('facebookexternalhit/1.1'), true);
  assert.equal(isLikelyBot(''), true);
  assert.equal(isLikelyBot(null), true);
  assert.equal(isLikelyBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'), false);
});

test('the report adds days per term, separates outcomes and orders by searches', () => {
  const s = summarizeSearchDemand([
    { day: '2026-11-20', term: 'termo stanley', outcome: 'none', searches: 2 },
    { day: '2026-11-21', term: 'termo stanley', outcome: 'none', searches: 3 },
    { day: '2026-11-21', term: 'bombilla pico', outcome: 'none', searches: 4 },
    { day: '2026-11-21', term: 'mate imperial', outcome: 'approximate', searches: 1 },
  ]);
  assert.deepEqual(s.none.map(r => [r.term, r.searches, r.days]), [['termo stanley', 5, 2], ['bombilla pico', 4, 1]]);
  assert.deepEqual(s.approximate.map(r => [r.term, r.searches]), [['mate imperial', 1]]);
  assert.equal(s.total, 10);
  assert.ok(SEARCH_DEMAND_WINDOW_DAYS >= 7);
});

test('the migration aggregates per day, re-checks the term and is closed to public roles', () => {
  const sql = read(migration);
  assert.match(sql, /primary key \(day, term, outcome\)/);
  assert.match(sql, /check \(outcome in \('none', 'approximate'\)\)/);
  assert.match(sql, /term !~ '\[0-9\]\{6\}'/);
  assert.match(sql, /position\('@' in term\) = 0/);
  assert.match(sql, /on conflict \(day, term, outcome\) do update set searches = public\.search_demand_daily\.searches \+ 1/);
  assert.match(sql, /America\/Argentina\/Buenos_Aires/);
  assert.match(sql, /revoke all on public\.search_demand_daily from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant select on public\.search_demand_daily to service_role;/);
  assert.match(sql, /revoke all on function public\.record_search_demand\(text, text\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.record_search_demand\(text, text\) to service_role;/);
  assert.doesNotMatch(sql, /user_agent|ip_address|session|customer/i);
  const bytes = readFileSync(resolve(root, migration));
  const entry = JSON.parse(read('staging/migration-manifest.json')).applicationOrder.find(e => e.source === migration);
  assert.ok(entry, 'registered in the staging manifest');
  assert.equal(bytes.includes(13), false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256);
  assert.match(read('reports/search-demand-rollback.sql'), /drop table if exists public\.search_demand_daily;/);
});

test('the store records after the response and never blocks the search', () => {
  const page = read('app/buscar/page.tsx');
  assert.match(page, /after\(\(\) => recordSearchDemand\(/);
  assert.match(page, /isLikelyBot\(/);
  const service = read('services/search-demand.ts');
  assert.match(service, /import "server-only";/);
  assert.match(service, /rpc\("record_search_demand"/);
  const report = service.slice(service.indexOf('export async function getSearchDemand'));
  assert.match(report, /^export async function getSearchDemand[^]*?await requireAdminSession\(\);\s*const client = getSupabaseAdminClient\(\);/);
  assert.match(read('app/admin/analytics/page.tsx'), /<SearchDemand \/>/);
});
