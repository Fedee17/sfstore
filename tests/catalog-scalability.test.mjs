import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';

// Scalability (26/11): synthetic products that do not exist in the current catalog go through the real public read
// layer (services/products.ts) with an in-memory Supabase. Adding products inside existing categories must need no code.
const root=resolve(import.meta.dirname,'..');const require=createRequire(import.meta.url);
function load(file,stubs,cache=new Map()){
 if(cache.has(file))return cache.get(file);const out={};cache.set(file,out);
 const compiled=ts.transpileModule(readFileSync(resolve(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',compiled)(name=>{
  if(Object.hasOwn(stubs,name))return stubs[name];
  const candidate=name.startsWith('@/')?name.slice(2):name.startsWith('.')?resolve(root,dirname(file),name):null;
  if(candidate)for(const ext of ['','.ts','.tsx'])if(existsSync(resolve(root,candidate+ext))&&statSync(resolve(root,candidate+ext)).isFile())return load(resolve(root,candidate+ext).slice(root.length+1).replaceAll('\\','/'),stubs,cache);
  return require(name);
 },out);return out;
}

// In-memory public views: same filters/pagination the service uses (order by id, gt, eq, in, limit).
const db={skus:[],cash:new Map()};
const query=table=>{const filters=[];let limit=Infinity;const builder={
 select:()=>builder,order:()=>builder,or:()=>builder,limit:n=>{limit=n;return builder;},
 gt:(column,value)=>{filters.push(row=>row[column]>value);return builder;},
 eq:(column,value)=>{filters.push(row=>row[column]===value);return builder;},
 in:(column,values)=>{filters.push(row=>values.includes(row[column]));return builder;},
 then:(resolveQuery,reject)=>{
  const rows=table==='public_catalog_skus'?db.skus:table==='public_catalog_cash_prices'?[...db.cash].map(([id,cash_price])=>({id,cash_price})):[];
  const data=structuredClone(rows).sort((a,b)=>a.id<b.id?-1:1).filter(row=>filters.every(filter=>filter(row))).slice(0,limit);
  return Promise.resolve({data,error:null}).then(resolveQuery,reject);
 }};return builder;};
const service=load('services/products.ts',{'@/lib/supabase/client':{getSupabaseClient:()=>({from:query})},'@/data/products':{products:[]}});
const {searchProducts,searchProductsWithRecovery}=load('lib/catalog/search.ts',{});
const {availableWithPhoto}=load('lib/catalog/availability-order.ts',{});
const {MATE_CATALOG_CATEGORIES}=load('lib/catalog/mate-filters.ts',{'@/components/catalog/catalog-sidebar':{}});

let sequence=0;
const row=(slug,categorySlug,{stock=3,images=[{url:`https://img.test/${slug}.webp`,alt:slug,sort_order:0,is_primary:true}],attributes=[],name=slug,featured=false}={})=>{
 const id=`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;db.cash.set(id,75);
 return {id,name,slug,short_description:`Resumen ${name}`,description:null,price:100,stock,featured,status:'active',historical_identity:false,
  category_id:`cat-${categorySlug}`,categories:{id:`cat-${categorySlug}`,name:categorySlug,slug:categorySlug,is_active:true},category_slug:categorySlug,
  product_images:images,product_attributes:attributes,family_id:null,variant_options:{},sku:null};
};
const perfumeAttributes=(gender,families,intensity)=>[{name:'gender',value:gender,sort_order:1},...families.map((value,i)=>({name:'olfactory_family',value,sort_order:2+i})),{name:'intensity',value:intensity,sort_order:9}];
const slugs=products=>products.map(product=>product.slug);
const bySlug=async slug=>(await service.getCatalogPublications()).find(product=>product.slug===slug);
const reset=rows=>{db.skus=rows;};

test('new products in existing categories join recommendations with no code change',async()=>{
 reset([
  row('mate-sintetico-nogal','mates'),row('bombilla-sintetica-alpaca','bombillas'),
  row('yerba-sintetica-organica','yerbas',{name:'Yerba Sintética Orgánica'}),row('matera-sintetica-lona','materas'),
  row('perfume-sintetico-nebula','perfumes',{name:'Nébula Ámbar Sintético',attributes:perfumeAttributes('femenino',['dulce','floral'],'media')}),
  row('perfume-sintetico-aurora','perfumes',{attributes:perfumeAttributes('femenino',['dulce','floral'],'media')}),
  row('perfume-sintetico-glaciar','perfumes',{attributes:perfumeAttributes('masculino',['fresco','citrico'],'suave')}),
 ]);
 const mate=await bySlug('mate-sintetico-nogal');
 assert.equal(mate.category,'mates');
 assert.deepEqual(slugs(await service.getRelatedProducts(mate)),['bombilla-sintetica-alpaca','matera-sintetica-lona','yerba-sintetica-organica']);
 assert.deepEqual(slugs(await service.getRelatedProducts(await bySlug('perfume-sintetico-aurora'))),['perfume-sintetico-nebula']);
 assert.deepEqual(slugs(await service.getRelatedProducts(await bySlug('perfume-sintetico-glaciar'))),[],'no compatible perfume, never the opposite gender');
});

test('new products appear in exact and approximate searches',async()=>{
 const catalog=await service.getCatalogPublications();
 assert.deepEqual(slugs(searchProducts(catalog,'nébula')),['perfume-sintetico-nebula']);
 const typo=searchProductsWithRecovery(catalog,'nebuka');
 assert.equal(typo.recovered,true);assert.deepEqual(slugs(typo.products),['perfume-sintetico-nebula']);
 const words=searchProductsWithRecovery(catalog,'yerba organika');
 assert.equal(words.recovered,true);assert.deepEqual(slugs(words.products),['yerba-sintetica-organica']);
 assert.deepEqual(slugs(searchProductsWithRecovery(catalog,'perfume mujer').products).sort(),['perfume-sintetico-aurora','perfume-sintetico-nebula']);
});

test('availability changes are read on the next request: sold-out falls behind and returns when restocked',async()=>{
 const mateRow=row('mate-sintetico-calabaza','mates');
 const first=row('bombilla-sintetica-a','bombillas'),second=row('bombilla-sintetica-b','bombillas');
 reset([mateRow,first,second]);
 const related=async()=>slugs(await service.getRelatedProducts(await bySlug('mate-sintetico-calabaza')));
 assert.deepEqual(await related(),['bombilla-sintetica-a','bombilla-sintetica-b']);
 first.stock=0;
 assert.deepEqual(await related(),['bombilla-sintetica-b','bombilla-sintetica-a']);
 assert.deepEqual(slugs(availableWithPhoto(await service.getCatalogPublications(),4)).sort(),['bombilla-sintetica-b','mate-sintetico-calabaza'],'search alternatives drop the sold-out product');
 first.stock=5;
 assert.deepEqual(await related(),['bombilla-sintetica-a','bombilla-sintetica-b']);
});

test('primary image: is_primary wins, else lowest sort_order; no image rows means no photo and no suggestion',async()=>{
 const image=(name,sort_order,is_primary=false)=>({url:`https://img.test/${name}.webp`,alt:name,sort_order,is_primary});
 reset([
  row('mate-sintetico-base','mates'),
  row('termo-sintetico-flag','termos',{images:[image('second',0),image('flagged',3,true)]}),
  row('vaso-sintetico-order','vasos-termicos',{images:[image('later',4),image('first',1)]}),
  row('bombilla-sintetica-sin-foto','bombillas',{images:[]}),
 ]);
 assert.equal((await bySlug('termo-sintetico-flag')).primaryImageUrl,'https://img.test/flagged.webp');
 assert.equal((await bySlug('vaso-sintetico-order')).primaryImageUrl,'https://img.test/first.webp');
 assert.equal((await bySlug('bombilla-sintetica-sin-foto')).primaryImageUrl,null);
 assert.deepEqual(slugs(await service.getRelatedProducts(await bySlug('mate-sintetico-base'))),['termo-sintetico-flag','vaso-sintetico-order']);
});

test('every matero subcategory offered by the storefront resolves to Mates and is cross-sold ahead of more mates',async()=>{
 const subcategories=MATE_CATALOG_CATEGORIES.map(category=>category.matchValue).filter(slug=>slug!=='mates');
 const notCrossSold=[];
 for(const slug of subcategories){
  // Featured mates would win the fallback, so only a real cross-sell kind puts the complement first.
  reset([row('mate-sintetico-hub','mates'),row('mate-sintetico-destacado-1','mates',{featured:true}),row('mate-sintetico-destacado-2','mates',{featured:true}),row(`sintetico-${slug}`,slug)]);
  const complement=await bySlug(`sintetico-${slug}`);
  assert.equal(complement.category,'mates',`${slug} must resolve to the Mates section`);
  if(slugs(await service.getRelatedProducts(await bySlug('mate-sintetico-hub')))[0]!==`sintetico-${slug}`)notCrossSold.push(slug);
 }
 assert.deepEqual(notCrossSold,[]);
});
