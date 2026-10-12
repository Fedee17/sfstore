import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const postcss=require('postcss');
const nextPostcss=createRequire(require.resolve('next/package.json'))('postcss');

test('nanoid negative and zero sizes finish in an isolated process; CSS IDs remain six characters',()=>{
 const script=`const assert=require('node:assert/strict');const {nanoid,customAlphabet}=require('nanoid/non-secure');const {customRandom}=require('nanoid');assert.equal(nanoid(-1),'');assert.equal(customAlphabet('abc')(-1),'');assert.equal(customAlphabet('abc')(0),'');assert.equal(customRandom('abc',0,n=>new Uint8Array(n))(0),'');assert.equal(nanoid(6).length,6);`;
 execFileSync(process.execPath,['-e',script],{cwd:resolve('.'),timeout:2500,stdio:'pipe'});
});

test('both PostCSS instances ignore traversal maps and maps without a CSS origin',()=>{
 const fixture=resolve('staging/runtime/postcss-regression-'+randomUUID());mkdirSync(join(fixture,'css'),{recursive:true});
 const outsideMap=JSON.stringify({version:3,sources:['private-synthetic.css'],sourcesContent:['SYNTHETIC_MAP_CONTENT'],names:[],mappings:'AAAA'});
 writeFileSync(join(fixture,'outside.map'),outsideMap);writeFileSync(join(fixture,'css','valid.map'),outsideMap);
 for(const engine of [postcss,nextPostcss]){
  const file=join(fixture,'css','input.css');writeFileSync(file,'a { color: red }');
  const traversed=engine.parse('a { color: red }\n/*# sourceMappingURL=../outside.map */',{from:file});assert.equal(traversed.source.input.map?.text,undefined);
  const missingOrigin=engine.parse('a { color: red }\n/*# sourceMappingURL='+join(fixture,'outside.map')+' */');assert.equal(missingOrigin.source.input.map?.text,undefined);
  const valid=engine.parse('a { color: red }\n/*# sourceMappingURL=valid.map */',{from:file});assert.ok(valid.source.input.map.text.includes('SYNTHETIC_MAP_CONTENT'));
 }
});

test('indexed source maps reject amplifying section offsets without blocking the process',()=>{
 const {SourceMapConsumer}=require('source-map-js');assert.throws(()=>new SourceMapConsumer({version:3,sections:[{offset:{line:1e12,column:0},map:{version:3,sources:[],names:[],mappings:''}}]}),/Section offset line/);
});

test('native Sharp still renders a synthetic SVG with patched upstream libraries',async()=>{
 const sharp=require('sharp');const semver=require('semver');assert.ok(semver.gte(sharp.versions.sharp,'0.35.5'));assert.ok(semver.gte(sharp.versions.vips,'8.18.3'));assert.ok(semver.gte(sharp.versions.heif,'1.23.2'));assert.ok(semver.gte(sharp.versions.rsvg,'2.63.2'));
 const output=await sharp(Buffer.from('<svg width="4" height="4" xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4" fill="red"/></svg>')).png().toBuffer();const metadata=await sharp(output).metadata();assert.equal(metadata.width,4);assert.equal(metadata.height,4);assert.equal(metadata.format,'png');
});
