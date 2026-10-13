import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateRawSync } from 'node:zlib';
import ts from 'typescript';
import XLSX from 'xlsx';
const require=createRequire(import.meta.url), cache=new Map();
function load(path, extra={}) { if(cache.has(path)&&!Object.keys(extra).length)return cache.get(path); const loadedModule={exports:{}};
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(id=>extra[id]??(id.startsWith('@/')?load(id.slice(2)+'.ts'):require(id)),loadedModule,loadedModule.exports);
 if(!Object.keys(extra).length)cache.set(path,loadedModule.exports); return loadedModule.exports; }
const {MAX_UPLOAD_FILE_BYTES,assertUploadFormData}=load('lib/uploads/limits.ts');
const {parseProductImportFile}=load('lib/product-import/file-parser.ts');
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function workbook(matrix=[['Producto','Precio'],['Sintético Ñ',100]],ref){const b=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet(matrix);if(ref)s['!ref']=ref;XLSX.utils.book_append_sheet(b,s,'Producto Perfumes');return b;}
const file=bytes=>new File([bytes],'synthetic.xlsx',{type:mime});
// Tiny ZIP fixtures only. No filesystem extraction or network.
function zipEntry(name, bytes, declared=bytes.length) {
 const n=Buffer.from(name),compressed=deflateRawSync(bytes),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(declared,22);local.writeUInt16LE(n.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(declared,24);central.writeUInt16LE(n.length,28);
 const start=Buffer.concat([local,n,compressed]),directory=Buffer.concat([central,n]);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(start.length,16);
 return Buffer.concat([start,directory,end]);
}
test('multipart budget counts all files and text, including metadata, before sending',()=>{
 const f=new FormData();f.set('file',new File([Buffer.alloc(MAX_UPLOAD_FILE_BYTES)],'a.xlsx'));f.set('sheetName','Producto Perfumes');assert.doesNotThrow(()=>assertUploadFormData(f));
 f.set('another',new File(['x'],'b.png'));assert.throws(()=>assertUploadFormData(f),/sumar/);
 const text=new FormData();text.set('value','ñ'.repeat(65537));assert.throws(()=>assertUploadFormData(text),/formulario/);
});
test('many multipart entries and long filenames fail closed',()=>{const f=new FormData();for(let i=0;i<129;i++)f.append('item','');assert.throws(()=>assertUploadFormData(f),/formulario/);const g=new FormData();g.set('file',new File(['x'],'a'.repeat(257)));assert.throws(()=>assertUploadFormData(g),/nombre/);});
test('oversize Excel rejected before worker parsing',async()=>{await assert.rejects(parseProductImportFile(new File([Buffer.alloc(MAX_UPLOAD_FILE_BYTES+1)],'a.csv',{type:'text/csv'}),'Producto Perfumes'),/3 MiB/);});
test('real parser preserves Excel serials and selected schema for CSV',async()=>{
 const b=workbook([['Producto','Fecha'],['Sintético',45365]]);b.Sheets['Producto Perfumes'].B2.z='yyyy-mm-dd';
 const rows=await parseProductImportFile(file(XLSX.write(b,{type:'buffer',bookType:'xlsx'})),'Producto Perfumes');assert.equal(rows[0].Fecha,45365);
 const csv=new File(['Producto,Precio\nSintético,100'],'a.csv',{type:'text/csv'});assert.equal((await parseProductImportFile(csv,'Producto Perfumes'))[0].Producto,'Sintético');
});
test('ZIP declared expansion budget rejects without allocating that size',async()=>{await assert.rejects(parseProductImportFile(file(zipEntry('[Content_Types].xml',Buffer.from('x'),9*1024*1024)),'Producto Perfumes'),/descompresión/);});
test('ZIP dishonest size cannot bypass actual bounded decompression',async()=>{await assert.rejects(parseProductImportFile(file(zipEntry('[Content_Types].xml',Buffer.alloc(9*1024*1024),1)),'Producto Perfumes'),/corrupto|recursos/);});
test('ZIP path traversal and format masquerading are rejected',async()=>{
 await assert.rejects(parseProductImportFile(file(zipEntry('../bad',Buffer.from('x'))),'Producto Perfumes'),/corrupto/);
 const bytes=XLSX.write(workbook(),{type:'buffer',bookType:'xlsx'});await assert.rejects(parseProductImportFile(new File([bytes],'a.csv',{type:'text/csv'}),'Producto Perfumes'),/corrupto/);
});
test('worker rejects dimensions exceeding row and column budgets',async()=>{for(const ref of ['A1:B2002','A1:BM2'])await assert.rejects(parseProductImportFile(file(XLSX.write(workbook(undefined,ref),{type:'buffer',bookType:'xlsx'})),'Producto Perfumes'),/dimensiones/);});
test('worker output budget bounds huge cell strings',async()=>{await assert.rejects(parseProductImportFile(file(XLSX.write(workbook([['Producto'],...Array.from({length:40},()=>['x'.repeat(30000)])]),{type:'buffer',bookType:'xlsx'})),'Producto Perfumes'),/descompresión|dimensiones/);});
test('concurrent parser request cannot allocate another worker',async()=>{const bytes=XLSX.write(workbook(),{type:'buffer',bookType:'xlsx'});const first=parseProductImportFile(file(bytes),'Producto Perfumes');await assert.rejects(parseProductImportFile(file(bytes),'Producto Perfumes'),/procesando/);await first;});
test('parser failures release capacity for a subsequent legitimate import',async()=>{await assert.rejects(parseProductImportFile(file(Buffer.from('bad')),'Producto Perfumes'));const rows=await parseProductImportFile(file(XLSX.write(workbook(),{type:'buffer',bookType:'xlsx'})),'Producto Perfumes');assert.equal(rows[0].Producto,'Sintético Ñ');});
test('worker memory/time budgets and bundle tracing are configured without credentials',()=>{const parser=readFileSync('lib/product-import/file-parser.ts','utf8'),config=readFileSync('next.config.ts','utf8');assert.match(parser,/maxOldGenerationSizeMb: 128/);assert.match(parser,/env: {}/);assert.match(parser,/5000/);assert.match(parser,/worker.terminate/);assert.match(config,/bodySizeLimit: "4mb"/);assert.match(config,/parser-worker.mjs/);assert.ok(config.includes("node_modules/xlsx"));});
test('administrator authorization still precedes file parsing and privileged lookups',()=>{const s=readFileSync('app/admin/productos/importar/actions.ts','utf8').split('export async function previewProductImport')[1].split('export async function previewGoogleSheetImport')[0];assert.ok(s.indexOf('requireAdminActionSession')<s.indexOf('parseProductImportFile'));assert.ok(s.indexOf('parseProductImportFile')<s.indexOf('findExistingProducts'));});

test('real worker timeout terminates stalled CPU work and releases parser capacity', {timeout:10000}, async()=>{
 class StalledWorker { constructor(optionsPath,options) { assert.ok(optionsPath.endsWith('parser-worker.mjs'));return new Worker('while(true) {}',{eval:true,env:options.env,resourceLimits:options.resourceLimits}); } }
 const parser=load('lib/product-import/file-parser.ts',{'node:worker_threads':{Worker:StalledWorker}});
 const start=Date.now();await assert.rejects(parser.parseProductImportFile(file(Buffer.from('test')),'Producto Perfumes'),/tiempo/);assert.ok(Date.now()-start<8000);
});
test('real worker heap ceiling contains allocation failure', {timeout:10000}, async()=>{
 class AllocatingWorker { constructor(_path,options) { return new Worker('const held=[];while(true)held.push(new Array(200000).fill(123));',{eval:true,env:options.env,resourceLimits:options.resourceLimits}); } }
 const parser=load('lib/product-import/file-parser.ts',{'node:worker_threads':{Worker:AllocatingWorker}});
 await assert.rejects(parser.parseProductImportFile(file(Buffer.from('test')),'Producto Perfumes'),/recursos|tiempo/);
});
test('CSV UTF-8 BOM, UTF-16 and historical Windows encoding preserve accents',async()=>{
 for(const bytes of [Buffer.from('\ufeffProducto,Precio\nSintético,100'),Buffer.concat([Buffer.from([255,254]),Buffer.from('Producto,Precio\nSintético,100','utf16le')]),Buffer.from('Producto,Precio\nSintético,100','latin1')]){
  const rows=await parseProductImportFile(new File([bytes],'a.csv',{type:'text/csv'}),'Producto Perfumes');assert.equal(rows[0].Producto,'Sintético');
 }
});

test('image and proof limits agree and size errors allow a corrected submission',()=>{
 const images=readFileSync('lib/products/product-image-files.ts','utf8'),form=readFileSync('components/admin/products/product-form.tsx','utf8');
 assert.match(images,/MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 3 \* 1024 \* 1024/);assert.match(form,/error instanceof UploadLimitError/);assert.match(form,/retryMode: "new"/);
});
