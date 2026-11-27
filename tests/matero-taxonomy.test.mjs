import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {MATERO_SUBCATEGORIES, MATERO_KIND_ORDER, materoKind} from '../lib/catalog/matero-taxonomy.ts';
import {resolvePublicCatalogSection} from '../lib/catalog/public-product-visibility.ts';
import {selectRelatedProducts} from '../lib/catalog/related-products.ts';

// CAT-03 (26/11): the matero subcategories live in one module; visibility, cross-sell and the Mates menu read it.
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
function load(file,cache=new Map()){
 if(cache.has(file))return cache.get(file);const out={};cache.set(file,out);
 new Function('require','exports',ts.transpileModule(readFileSync(resolve(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{
  const candidate=name.startsWith('@/')?name.slice(2):name.startsWith('.')?resolve(root,dirname(file),name):null;
  if(candidate)for(const ext of ['','.ts','.tsx'])if(existsSync(resolve(root,candidate+ext))&&statSync(resolve(root,candidate+ext)).isFile())return load(resolve(root,candidate+ext).slice(root.length+1).replaceAll('\\','/'),cache);
  return require(name);
 },out);return out;
}
const section=slug=>resolvePublicCatalogSection({status:'active',historicalIdentity:false,categorySlug:slug,categoryIsActive:true});

test('every matero subcategory resolves to the Mates section; perfumes and other accessories keep theirs',()=>{
 assert.deepEqual(MATERO_SUBCATEGORIES.map(entry=>entry.slug),['mates','termos','vasos-termicos','bombillas','bombillones','materas','yerbas','latas-de-yerba','dispenser-de-yerba','despolvilladores','porta-mate','accesorios-materos','combos-materos','box-regalos-materos']);
 assert.deepEqual(MATERO_SUBCATEGORIES.filter(entry=>section(entry.slug)!=='mates').map(entry=>entry.slug),[]);
 assert.equal(section('perfumes'),'perfumes');
 for(const slug of ['accesorios','electronica','regalos','subcategoria-nueva'])assert.equal(section(slug),'accesorios');
});

test('the Mates menu keeps its approved labels, links and order',()=>{
 const {MATE_CATALOG_CATEGORIES}=load('lib/catalog/mate-filters.ts');
 assert.deepEqual(MATE_CATALOG_CATEGORIES,[
  {label:'Mates',hrefValue:'mates',matchValue:'mates'},{label:'Termos',hrefValue:'termos',matchValue:'termos'},
  {label:'Bombillas',hrefValue:'bombillas',matchValue:'bombillas'},{label:'Bombillones',hrefValue:'bombillones',matchValue:'bombillones'},
  {label:'Materas',hrefValue:'materas',matchValue:'materas'},{label:'Yerbas',hrefValue:'yerbas',matchValue:'yerbas'},
  {label:'Latas de yerba',hrefValue:'latas-yerba',matchValue:'latas-de-yerba'},{label:'Dispenser de yerba',hrefValue:'dispenser-yerba',matchValue:'dispenser-de-yerba'},
  {label:'Despolvilladores',hrefValue:'despolvilladores',matchValue:'despolvilladores'},{label:'Portamate',hrefValue:'porta-mate',matchValue:'porta-mate'},
  {label:'Combos materos',hrefValue:'combos-materos',matchValue:'combos-materos'},{label:'Regalos materos',hrefValue:'box-regalos-materos',matchValue:'box-regalos-materos'},
 ]);
});

test('cross-sell kinds and their order are unchanged',()=>{
 assert.deepEqual(MATERO_KIND_ORDER,['mates','bombillas','termos','materas','yerba','otros','regalos']);
 assert.deepEqual(Object.fromEntries(MATERO_SUBCATEGORIES.map(entry=>[entry.slug,materoKind(entry.slug)])),{
  mates:'mates',termos:'termos','vasos-termicos':'termos',bombillas:'bombillas',bombillones:'bombillas',materas:'materas',
  yerbas:'yerba','latas-de-yerba':'yerba','dispenser-de-yerba':'yerba',despolvilladores:'otros','porta-mate':'otros','accesorios-materos':'otros',
  'combos-materos':'regalos','box-regalos-materos':'regalos',
 });
 assert.equal(materoKind('accesorios'),undefined);
});

test('a subcategory added to the shared list is visible, cross-sold and keeps the menu in sync',()=>{
 // Behaviour depends only on the list: a product in each listed subcategory reaches a mate page cross-sell.
 const product=(slug,categorySlug,category='mates')=>({id:'id-'+slug,slug,name:slug,category,categorySlug,price:100,stock:1,featured:false,primaryImageUrl:'/'+slug+'.webp',attributes:[]});
 const mate=product('mate','mates');
 const catalog=[mate,...MATERO_SUBCATEGORIES.filter(entry=>entry.slug!=='mates').map(entry=>product('item-'+entry.slug,entry.slug))];
 const reached=new Set(selectRelatedProducts(mate,catalog,50).map(item=>item.categorySlug));
 assert.deepEqual(MATERO_SUBCATEGORIES.filter(entry=>entry.slug!=='mates'&&!reached.has(entry.slug)).map(entry=>entry.slug),[]);
});

test('no other module keeps its own list of matero subcategories',()=>{
 for(const file of ['lib/catalog/public-product-visibility.ts','lib/catalog/related-products.ts','lib/catalog/mate-filters.ts']){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(source,/matero-taxonomy/,file+' must read the shared taxonomy');
  for(const slug of ['bombillones','latas-de-yerba','vasos-termicos','box-regalos-materos'])assert.doesNotMatch(source,new RegExp(`["']${slug}["']`),`${file} repeats ${slug}`);
 }
});
