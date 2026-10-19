import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { Worker } from 'node:worker_threads';
import XLSX from 'xlsx';

// Execute the emitted Turbopack worker, not the source or a TS transpilation.
// No network, service credentials, database mutations or real imported files.
const tracePath = resolve('.next/server/app/admin/productos/importar/page.js.nft.json');
const files = JSON.parse(readFileSync(tracePath, 'utf8')).files.map(file => resolve(dirname(tracePath), file));
const workers = [...new Set(files.filter(file => /\[worker thread\].*parser-worker.*\.js$/.test(file)))];
assert.equal(workers.length, 1, 'Exactly one compiled import worker must be traced');
assert.ok(files.some(file => file.replaceAll('\\', '/').endsWith('lib/product-import/parser-worker.mjs')), 'Source worker must be packaged');
assert.ok(files.some(file => file.replaceAll('\\', '/').endsWith('node_modules/xlsx/xlsx.mjs')), 'SheetJS ESM must be packaged');
assert.ok(files.some(file => file.replaceAll('\\', '/').endsWith('node_modules/xlsx/dist/cpexcel.full.mjs')), 'XLS codepages must be packaged');
for (const file of files) assert.ok(existsSync(file), 'Every traced runtime file must exist');

async function parse(input, extension) {
  const bytes = Uint8Array.from(input).buffer;
  const worker = new Worker(workers[0], {
    workerData: { bytes, extension, sheetName: 'Producto Perfumes' },
    transferList: [bytes], env: {},
    resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
  });
  try {
    return await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('Compiled worker exceeded 5 seconds')), 5000);
      worker.once('message', message => { clearTimeout(timer); accept(message); });
      worker.once('error', error => { clearTimeout(timer); reject(error); });
      worker.once('exit', code => { clearTimeout(timer); reject(new Error('Worker exited without result: ' + code)); });
    });
  } finally { await worker.terminate(); }
}
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Producto', 'Precio'], ['Sintético Ñ', 100]]), 'Producto Perfumes');
for (const extension of ['xlsx', 'xls']) {
  const result = await parse(XLSX.write(book, {type:'buffer', bookType:extension}), extension);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.rows, [{Producto:'Sintético Ñ', Precio:100}]);
  console.log('Compiled worker: ' + extension + ' passed');
}
const csv = await parse(Buffer.from('\ufeffProducto,Precio\nSintético Ñ,100'), 'csv');
assert.equal(csv.error, undefined); assert.equal(csv.rows[0].Producto, 'Sintético Ñ');
console.log('Compiled worker: UTF-8 CSV passed');
const corrupt = await parse(Buffer.from('safe corrupt fixture'), 'xlsx');
assert.match(corrupt.error, /corrupto/); assert.equal(corrupt.rows, undefined);
console.log('Compiled worker: corrupt input safely rejected');
const largeBook = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet([['Producto'], ['Sintético']]);
sheet['!ref'] = 'A1:B2002'; XLSX.utils.book_append_sheet(largeBook, sheet, 'Producto Perfumes');
const excessive = await parse(XLSX.write(largeBook, {type:'buffer',bookType:'xlsx'}), 'xlsx');
assert.match(excessive.error, /dimensiones/); assert.equal(excessive.rows, undefined);
console.log('Compiled worker: excessive dimensions safely rejected');
console.log('Compiled runtime smoke passed; no real services accessed.');