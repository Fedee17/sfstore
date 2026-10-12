import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import ts from 'typescript';
import XLSX, { version, set_fs } from 'xlsx';
import * as nodeFs from 'node:fs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
// Load pure import modules only; no action, Supabase client or historical script executes.
function loadTs(relative) {
  const path = resolve(root, relative);
  if (cache.has(path)) return cache.get(path).exports;
  const loadedModule = { exports: {} }; cache.set(path, loadedModule);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (id) => id.startsWith('@/') ? loadTs(id.slice(2) + '.ts')
    : id.startsWith('.') ? loadTs(resolve(dirname(path), id).replace(/\.ts$/, '') + '.ts') : require(id);
  new Function('require', 'module', 'exports', code)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { readRawWorksheetRows } = loadTs('lib/product-import/workbook.ts');
const { normalizeProductImportRows } = loadTs('lib/product-import/core.ts');
const actionSource = readFileSync(join(root, 'app/admin/productos/importar/actions.ts'), 'utf8');
const actionAst = ts.createSourceFile('actions.ts', actionSource, ts.ScriptTarget.Latest, true);
const readerSource = actionAst.statements.filter(node =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'readWorkbook' ||
  ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration =>
    ['MAX_FILE_SIZE', 'IMPORTABLE_MIME_TYPES'].includes(declaration.name.getText(actionAst))))
  .map(node => node.getText(actionAst)).join('\n');
const readerCode = ts.transpileModule(readerSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const readWorkbook = new Function('XLSX', 'Buffer', readerCode + '\nreturn readWorkbook;')(XLSX, Buffer);
function workbook(sheetName, matrix) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), sheetName);
  return book;
}
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('official corrected SheetJS artifact is pinned with SHA-512 and no added dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
  const entry = lock.packages['node_modules/xlsx'];
  assert.equal(version, '0.20.3');
  assert.equal(entry.version, version);
  assert.equal(pkg.dependencies.xlsx, 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz');
  assert.equal(entry.resolved, pkg.dependencies.xlsx);
  assert.equal(entry.integrity, 'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==');
  assert.equal(entry.license, 'Apache-2.0');
  assert.equal(entry.dependencies, undefined);
});

for (const [format, extension, type] of [['xlsx', 'xlsx', mime], ['biff8', 'xls', 'application/vnd.ms-excel'], ['csv', 'csv', 'text/csv']]) {
  test(`${extension}: actual upload reader preserves accents, decimals, empty cells and classification`, async () => {
    const book = workbook('Producto Perfumes', [
      ['Producto', 'Precio de venta', 'Precio final con descuento', 'Costo unitario', 'Proveedor'],
      ['Perfume sintético Ñandú', 1234.56, 925.92, 600, null],
      ['Producto inválido sintético', -1, 5, 0, 'Prueba'],
    ]);
    const parsed = await readWorkbook(new File([XLSX.write(book, { type: 'buffer', bookType: format })], 'synthetic.' + extension, { type }));
    const sheet = parsed.Sheets[parsed.SheetNames[0]];
    const rows = readRawWorksheetRows(sheet, { defval: '' });
    assert.equal(rows[0].Producto, 'Perfume sintético Ñandú');
    assert.equal(Number(rows[0]['Precio de venta']), 1234.56);
    assert.equal(rows[0].Proveedor, '');
    const normalized = normalizeProductImportRows('Producto Perfumes', rows);
    assert.equal(normalized[0].price, 1234.56);
    assert.equal(normalized[0].transferPrice, 925.92);
    assert.equal(normalized[0].categorySlug, 'perfumes');
    assert.equal(normalized[0].stock, 0);
    assert.deepEqual(normalized[0].errors, []);
    assert.ok(normalized[1].errors.length > 0);
  });
}

test('actual upload validation rejects empty, oversize, unsupported extension and MIME', async () => {
  await assert.rejects(readWorkbook(new File([], 'empty.xlsx', { type: mime })), /Subí/);
  await assert.rejects(readWorkbook(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.xlsx', { type: mime })), /5 MB/);
  await assert.rejects(readWorkbook(new File(['test'], 'bad.exe', { type: mime })), /Formato inválido/);
  await assert.rejects(readWorkbook(new File(['test'], 'bad.xlsx', { type: 'application/javascript' })), /Tipo de archivo/);
});

test('truncated XLSX and damaged ZIP reject before rows can be imported', async () => {
  const bytes = XLSX.write(workbook('Producto Perfumes', [['Producto'], ['Sintético']]), { type: 'buffer', bookType: 'xlsx' });
  await assert.rejects(readWorkbook(new File([bytes.subarray(0, bytes.length / 2)], 'truncated.xlsx', { type: mime })));
  await assert.rejects(readWorkbook(new File([Buffer.from('PK\x03\x04synthetic-invalid-zip')], 'corrupt.xlsx', { type: mime })));
});

test('historical serial dates, formulas, matrix nulls and source number formats survive', () => {
  const book = workbook('Control de ventas', [['Fecha', 'Total', 'Vacío'], [46207, 100, null]]);
  const sheet = book.Sheets['Control de ventas'];
  sheet.A2.z = 'yyyy-mm-dd'; sheet.B2.f = '50+50';
  const parsed = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellDates: false, cellText: true, cellNF: true });
  const result = readRawWorksheetRows(parsed.Sheets['Control de ventas'], { header: 1, defval: null });
  assert.deepEqual(result, [['Fecha', 'Total', 'Vacío'], [46207, 100, null]]);
  assert.equal(parsed.Sheets['Control de ventas'].A2.z, 'yyyy-mm-dd');
  assert.equal(parsed.Sheets['Control de ventas'].B2.f, '50+50');
  const date = XLSX.SSF.parse_date_code(result[1][0]);
  assert.deepEqual([date.y, date.m, date.d], [2026, 7, 4]);
});

test('historical readFile default import still works on a synthetic temporary workbook', () => {
  set_fs(nodeFs);
  const fixtures = join(root, 'staging/runtime'); mkdirSync(fixtures, { recursive: true });
  const folder = mkdtempSync(join(fixtures, 'sfstore-xlsx-'));
  const path = join(folder, 'synthetic.xlsx');
  writeFileSync(path, XLSX.write(workbook('Control de compras', [['Producto'], ['Sintético']]), { type: 'buffer', bookType: 'xlsx' }));
  assert.deepEqual(readRawWorksheetRows(XLSX.readFile(path, { cellDates: false, cellNF: true }).Sheets['Control de compras'], { header: 1, defval: null }), [['Producto'], ['Sintético']]);
});

test('bounded hostile XLSX fixtures cannot pollute prototypes, evaluate formulas or resolve XML entities', () => {
  const script = String.raw`
    const assert=require('node:assert/strict'), X=require('xlsx'), fs=require('node:fs');
    const before=Object.getOwnPropertyDescriptors(Object.prototype);
    const b=X.utils.book_new(), s=X.utils.aoa_to_sheet([['__proto__','constructor','prototype','Producto','Entidad'],['sfstore-pollution','marker','marker','<script>synthetic</script>','ENTITY_SENTINEL']]);
    s.D2.f='WEBSERVICE("https://sfstore-synthetic.invalid/")';
    X.utils.book_append_sheet(b,s,'Producto Perfumes');
    const zip=X.CFB.read(X.write(b,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
    const entry=X.CFB.find(zip,'Root Entry/xl/worksheets/sheet1.xml');assert.ok(entry);
    let xml=Buffer.from(entry.content).toString('utf8');
    xml=xml.replace('<worksheet ', '<worksheet constructor="marker" __proto__="marker" prototype="marker" data-safe="'+' '.repeat(4096)+'" ');
    xml=xml.replace('<worksheet ', '<!DOCTYPE worksheet [<!ENTITY sfstore SYSTEM "file:///SFSTORE_SYNTHETIC_ENTITY_NOT_REAL">]><worksheet ');
    xml=xml.replace('ENTITY_SENTINEL','&sfstore;');
    globalThis.fetch=()=>{throw new Error('Unexpected network request');};
    const originalRead=fs.readFileSync;fs.readFileSync=function(path,...args){assert.ok(!String(path).includes('SFSTORE_SYNTHETIC_ENTITY_NOT_REAL'));return originalRead.call(this,path,...args);};
    assert.ok(xml.includes('&sfstore;'));
    entry.content=Buffer.from(xml);entry.size=entry.content.length;
    const parsed=X.read(X.CFB.write(zip,{type:'buffer',fileType:'zip'}),{type:'buffer',cellDates:false,raw:true});
    const rows=X.utils.sheet_to_json(parsed.Sheets['Producto Perfumes'],{defval:'',raw:true});
    assert.equal(rows[0].Producto,'<script>synthetic</script>');
    assert.equal(rows[0].Entidad,'&sfstore;');
    assert.equal(parsed.Sheets['Producto Perfumes'].D2.v,'<script>synthetic</script>');
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype),before);
    assert.equal({}.sfstorePolluted,undefined);
  `;
  execFileSync(process.execPath, ['--max-old-space-size=128', '-e', script], { cwd: root, timeout: 5000, stdio: 'pipe', maxBuffer: 1024 * 1024 });
});
