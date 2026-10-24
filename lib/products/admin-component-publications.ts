import type {AdminProduct,AdminProductFilters} from '../../services/admin.ts';
import {componentPublicationName,componentPublicationSlug} from './component-combos.ts';
export type AdminComponentOffer = {
  presentation_product:string;connector:string;head_product:string;available:number;
  combo_list_price:number|string;combo_transfer_price:number|string;
  image_id:string|null;image_url:string|null;image_alt:string|null;
};
/** Read projection only: reuse existing public offers, never create inventory identities. */
export function mergeAdminProductPublications(products:AdminProduct[],offers:AdminComponentOffer[],heads:AdminProduct[],filters:AdminProductFilters={}) {
  const presentations=new Set(offers.map(o=>o.presentation_product));
  const rows=products.filter(p=>!presentations.has(p.id));
  const seen=new Set<string>();
  for(const offer of offers) {
    if(offer.connector!=='cc'&&offer.connector!=='lightning')throw Error('INVALID_COMPONENT_CONNECTOR');
    const id=componentPublicationSlug(offer.presentation_product,offer.connector);
    if(seen.has(id))throw Error('DUPLICATE_COMPONENT_PUBLICATION');
    seen.add(id);
    const head=heads.find(p=>p.id===offer.head_product);
    if(!head)throw Error('COMPONENT_CATEGORY_UNAVAILABLE');
    const row:AdminProduct={id,component_offer:true,name:componentPublicationName(offer.connector),slug:id,
      category_id:head.category_id,categories:head.categories,status:'active',featured:false,
      price:Number(offer.combo_list_price),transfer_price:Number(offer.combo_transfer_price),cost:null,
      stock:Number(offer.available),sku:null,
      product_images:offer.image_id&&offer.image_url?[{id:offer.image_id,url:offer.image_url,alt:offer.image_alt,is_primary:true,sort_order:0}]:[]};
    const search=filters.search?.trim().toLocaleLowerCase('es-AR');
    if(search&&!`${row.name} ${row.slug}`.toLocaleLowerCase('es-AR').includes(search))continue;
    if(filters.category&&filters.category!==row.category_id)continue;
    if(filters.status&&filters.status!==row.status)continue;
    if(filters.featured)continue;
    if(filters.stock==='out'&&row.stock!==0)continue;
    if(filters.stock==='low'&&!(row.stock>0&&row.stock<=3))continue;
    rows.push(row);
  }
  return rows;
}
