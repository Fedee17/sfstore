import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderGallery} from './fixtures/component-gallery-render.mjs';
import {galleryConnector,componentGalleryPath} from '../lib/products/component-gallery.ts';
test('same product editor renders image upload only, without commercial form fields, for both connectors',()=>{
 for(const c of ['cc','lightning']){
  const html=renderGallery(c);
  assert.match(html,/Imagenes actuales/);assert.match(html,/name="productImages"/);assert.match(html,/multiple=""/);assert.match(html,/Guardar fotografías/);
  assert.ok(html.includes(`name="connector" value="${c}"`));
  for(const field of ['price','transferPrice','cost','stock','name','categoryId','featured'])assert.ok(!html.includes(`name="${field}"`),field);
 }
});
test('ordinary product editor retains normal commercial form and upload',()=>{
 const html=renderGallery(null);
 assert.match(html,/name="price"/);assert.match(html,/name="name"/);assert.match(html,/name="productImages"/);
});
test('connector parser rejects forged values and editor links carry exact connector',()=>{
 for(const v of [null,'','usb','cc&price=1'])assert.throws(()=>galleryConnector(v));
 assert.equal(componentGalleryPath('product','lightning'),'/admin/productos/combo-product-lightning/editar');
});
