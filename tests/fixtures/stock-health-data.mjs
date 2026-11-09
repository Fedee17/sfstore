import {buildCommercialFacts} from '../../lib/commercial-reporting/model.ts';
import {buildStockHealth} from '../../lib/admin/stock-health.ts';

export function stockFixture() {
  const policy={version:'synthetic-stock',excludedOrderIds:['test-sale'],excludedProductIds:['test-product'],excludedCategoryIds:['test-category'],excludedPurchaseIds:[],sourceBatches:[{id:'batch',sha256:'verified'}],imputedPurchases:[],exclusionCoverage:'reviewed_complete'};
  const commercial={orders:[],saleLines:[],payments:[],purchases:[],purchaseLines:[],provenance:[],products:[],batches:[{id:'batch',source_sha256:'verified'}]};
  const inventory={asOf:'2026-11-08T15:00:00Z',products:[]};
  function product(id,patch={}) {
    const row={id,category_id:'real-category',name:`Producto sintético ${id}`,sku:null,family_id:null,variant_label:'',status:'active',created_at:'2026-08-01T12:00:00Z',available:2,reserved:0,cost:'100.00',...patch};
    inventory.products.push(row);commercial.products.push({id,category_id:row.category_id});return row;
  }
  function sale(productId,{id=`sale-${commercial.orders.length}`,quantity=30,date='2026-11-07T12:00:00Z',...patch}={}) {
    commercial.orders.push({id,order_number:id,channel:'store',status:'confirmed',payment_status:'paid',historical_import:false,historical_occurred_on:null,affects_inventory:true,created_at:date,store_sale_date:null,subtotal:quantity*100,discount:0,shipping_cost:0,total:quantity*100,cost_snapshot_policy:null,...patch});
    commercial.saleLines.push({id:`line-${id}`,order_id:id,product_id:productId,product_name:`Producto ${productId}`,category_name:'Sintética',quantity,unit_price:100,subtotal:quantity*100,list_unit_price_snapshot:100,unit_cost_snapshot:null});
    commercial.payments.push({id:`payment-${id}`,order_id:id,method:'cash',store_payment_method:'cash',status:'approved',amount:quantity*100,paid_at:date});
    return id;
  }
  return {policy,commercial,inventory,product,sale,run:()=>buildStockHealth(buildCommercialFacts(commercial,policy).sales,inventory,policy)};
}
export function stockPreviewData() {
  const f=stockFixture();
  for(let i=0;i<8;i++) {f.product(`risk-${i}`,{available:i,reserved:i%2,name:`Mate Camionero de algarrobo con virola ${i} · nombre largo de prueba`,variant_label:i%2?'Color: Marrón':''});f.sale(`risk-${i}`);}
  for(let i=0;i<8;i++) f.product(`idle-${i}`,{available:i+1,cost:i===0?null:'12345.67',name:`Termo de acero inoxidable ${i} · edición de prueba`});
  f.product('recent',{created_at:'2026-11-01T12:00:00Z'});
  return f.run();
}
