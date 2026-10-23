import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMobileFilterDraft, mobileFilterHref } from '../lib/catalog/mobile-filter-state.ts';

const category = { label: 'Árabe', hrefValue: 'arabe', matchValue: 'arabe' };
const groups = [
  { label:'Familia',param:'familia',options:[{label:'Dulce',value:'dulce'},{label:'Fresco',value:'fresco'}] },
  { label:'Intensidad',param:'intensidad',options:[{label:'Suave',value:'suave'},{label:'Intensa',value:'intensa'}] },
];

test('abre desde URL con atributos existentes sin mutar sus parámetros', () => {
  const params=new URLSearchParams('categoria=arabe&familia=dulce&intensidad=intensa');
  assert.deepEqual(readMobileFilterDraft(groups,params),{familia:'dulce',intensidad:'intensa'});
  assert.equal(params.toString(),'categoria=arabe&familia=dulce&intensidad=intensa');
});
test('los cambios de borrador no alteran la selección aplicada', () => {
  const params=new URLSearchParams('familia=dulce'); const draft=readMobileFilterDraft(groups,params);
  draft.familia='fresco'; assert.equal(params.get('familia'),'dulce');
});
test('aplica varios grupos una sola vez al mismo contrato URL', () => {
  assert.equal(mobileFilterHref('/perfumes',category,groups,{familia:'dulce',intensidad:'intensa'}),'/perfumes?categoria=arabe&familia=dulce&intensidad=intensa');
});
test('limpiar conserva categoría y elimina atributos', () => {
  assert.equal(mobileFilterHref('/perfumes',category,groups,{}),'/perfumes?categoria=arabe');
});
test('todos vuelve al catálogo sin categoría', () => assert.equal(mobileFilterHref('/mates',undefined,[],{}),'/mates'));
test('un valor desconocido o de otra categoría no se propaga', () => {
  assert.deepEqual(readMobileFilterDraft(groups,new URLSearchParams('familia=no-existe&color=rojo')),{});
  assert.equal(mobileFilterHref('/perfumes',category,groups,{familia:'no-existe',color:'rojo'}),'/perfumes?categoria=arabe');
});
test('desactivar una opción no produce parámetro vacío', () => {
  assert.equal(mobileFilterHref('/perfumes',category,groups,{familia:''}),'/perfumes?categoria=arabe');
});
test('categorías sin grupos siguen siendo navegables', () => {
  assert.equal(mobileFilterHref('/mates',{label:'Termos',hrefValue:'termos',matchValue:'termos'},[],{}),'/mates?categoria=termos');
});
