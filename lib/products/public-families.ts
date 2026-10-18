import type { Product } from "../../types/product.ts";
/** A family is a publication, never inventory. Availability derives from its SKU. */
export function groupPublicProducts<T extends Product>(products: T[]): T[] {
 const simple=products.filter(p=>!p.familyId), families=new Map<string,T[]>();
 for(const p of products)if(p.familyId){const rows=families.get(p.familyId)??[];rows.push(p);families.set(p.familyId,rows);}
 for(const [id,rows] of families){
  rows.sort((a,b)=>(a.variantLabel??a.name).localeCompare(b.variantLabel??b.name,"es")||a.id.localeCompare(b.id));
  const first=rows[0],eligible=rows.some(p=>p.stock>0)?rows.filter(p=>p.stock>0):rows;
  const priceSource=eligible.reduce((a,b)=>a.price<=b.price?a:b);
  simple.push({...first,id,kind:"family",sku:null,variantOptions:undefined,variantLabel:undefined,name:first.familyName??first.name,slug:first.familySlug??first.slug,
    price:priceSource.price,transferPrice:priceSource.transferPrice,stock:0,featured:rows.some(p=>p.featured),variants:rows});
 }
 return simple.sort((a,b)=>Number(b.featured)-Number(a.featured)||a.name.localeCompare(b.name,"es")||a.id.localeCompare(b.id));
}
export function publicationAvailable(product: Product) {
 return product.kind==="family" ? Boolean(product.variants?.some(p=>p.stock>0)) : product.stock>0;
}
