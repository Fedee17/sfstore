"use client";
import { useActionState } from "react";
import Link from "next/link";
import { saveFamily,addOption,addValue,saveVariant } from "@/app/admin/productos/familias/actions";
import { initialVariantState,variantAvailability,type Family,type FamilyOption,type Variant } from "@/lib/products/variants";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
const input="w-full rounded-xl border border-[#8B5E3C]/25 bg-white p-3 text-sm";
const box="grid gap-4 rounded-3xl border border-[#8B5E3C]/20 bg-white/70 p-5";
function Feedback({state}:{state:typeof initialVariantState}) {return state.message?<p role={state.ok?"status":"alert"} className="text-sm font-semibold">{state.message}{state.ok&&state.familyId?<> <Link className="underline" href={`/admin/productos/familias/${state.familyId}`}>Ver familia actualizada</Link></>:null}</p>:null;}
function Save(){return <PendingSubmitButton pendingLabel="Guardando…" className="rounded-xl bg-[#556B2F] px-5 py-3 font-semibold text-white disabled:opacity-50">Guardar</PendingSubmitButton>;}
export function FamilyForm({family,id,categories}:{family?:Family;id:string;categories:{id:string;name:string}[]}) {
 const [state,action]=useActionState(saveFamily,initialVariantState);
 return <form key={family?.revision??id} action={action} className={box}><h2 className="text-xl font-semibold">{family?"Editar familia":"Crear familia"}</h2>
 <input type="hidden" name="familyId" value={id}/><input type="hidden" name="revision" value={family?.revision??0}/>
 <label>Nombre<input className={input} name="name" required maxLength={160} defaultValue={family?.name}/></label>
 <label>Slug<input className={input} name="slug" defaultValue={family?.slug} maxLength={160}/></label>
 <label>Categoría<select className={input} name="categoryId" defaultValue={family?.category_id} required>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>Precio base de lista<input className={input} name="price" type="number" min="0" step="0.01" required defaultValue={family?.base_price}/></label>
 <p className="text-sm">Sólo cambia el precio de los SKU que lo heredan. Las excepciones y el stock se conservan.</p><Save/><Feedback state={state}/></form>;
}
export function OptionForm({familyId}:{familyId:string}) {
 const [state,action]=useActionState(addOption,initialVariantState);
 return <form action={action} className={box}><h2 className="text-xl font-semibold">Agregar opción</h2><input type="hidden" name="familyId" value={familyId}/>
 <label>Nombre (por ejemplo, Color)<input className={input} name="name" maxLength={60} required/></label>
 <label>Valores, uno por renglón<textarea className={input} name="values" maxLength={2000} required placeholder={"Negro\nVerde"}/></label>
 <p className="text-sm">Definí todas las dimensiones antes de crear el primer SKU. Después podés agregar valores.</p><Save/><Feedback state={state}/></form>;
}
export function ValueForm({familyId,option}:{familyId:string;option:FamilyOption}) {
 const [state,action]=useActionState(addValue,initialVariantState);
 return <form action={action} className={box}><h3 className="font-semibold">{option.name}: {option.values.map(v=>v.label).join(", ")}</h3>
 <input type="hidden" name="familyId" value={familyId}/><input type="hidden" name="optionId" value={option.id}/><label>Nuevo valor<input className={input} name="label" maxLength={80} required/></label><Save/><Feedback state={state}/></form>;
}
export function VariantForm({family,options,variant,id,candidate=false}:{family:Family;options:FamilyOption[];variant?:Variant;id:string;candidate?:boolean}) {
 const [state,action]=useActionState(saveVariant,initialVariantState);
 return <form key={variant?.version??id} action={action} className={box}><h2 className="text-xl font-semibold">{candidate?`Asociar ${variant?.name}`:variant?variant.name:"Agregar SKU"}</h2>
 <input type="hidden" name="familyId" value={family.id}/><input type="hidden" name="productId" value={id}/><input type="hidden" name="version" value={variant?.version??""}/><input type="hidden" name="new" value={variant?"no":"yes"}/>
 {variant?<><p>SKU: {variant.sku} · Estado: {variant.status} · Stock: {variant.stock} · Precio lista: ${Number(variant.price).toFixed(2)} · Costo: {variant.cost===null?"Costo no disponible":`$${Number(variant.cost).toFixed(2)}`}</p>
 <p className="text-sm">{variantAvailability(variant.web_visible,variant.commercial_blocked)}</p>
 <Link className="font-semibold underline" href={`/admin/productos/${id}/editar`}>Editar fotografías y datos del SKU</Link></>:<>
 <label>Nombre específico<input className={input} name="name" required maxLength={160} placeholder={`${family.name} — Negro`}/></label>
 <label>SKU único<input className={input} name="sku" required maxLength={100}/></label><label>Slug<input className={input} name="slug" maxLength={160}/></label>
 <p className="text-sm">Se crea como borrador, sin stock y sin costo asignado. Las imágenes se administran en el editor existente.</p></>}
 {options.map(o=><label key={o.id}>{o.name}<select aria-label={o.name} className={input} name={variant&&!candidate?undefined:`option:${o.id}`} disabled={!!variant&&!candidate} defaultValue={variant?.variant_choices[o.id]??""} required><option value="" disabled>Elegí un valor</option>{o.values.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select>{variant&&!candidate?<input type="hidden" name={`option:${o.id}`} value={variant.variant_choices[o.id]}/>:null}</label>)}
 <label><input type="checkbox" name="inherit" disabled={candidate} defaultChecked={!candidate&&(!variant||variant.list_price_override===null)}/> Heredar precio base (${Number(family.base_price).toFixed(2)})</label>
 <label>Excepción de precio lista (se usa sólo si no hereda)<input className={input} type="number" name="override" min="0" step="0.01" readOnly={candidate} defaultValue={candidate?variant?.price:variant?.list_price_override??""}/></label>
 <label><input type="checkbox" name="webVisible" defaultChecked={variant?.web_visible??false}/> Visible en web cuando esté activo</label>
 <label><input type="checkbox" name="blocked" defaultChecked={variant?.commercial_blocked??false}/> Bloqueado para nuevas ventas en todos los canales</label>
 {candidate?<p className="text-sm font-semibold">La asociación conserva ID, stock, costo, imágenes y precio actual como excepción. No reparte unidades entre variantes.</p>:null}
 <p className="text-sm">Ocultar en web permite seguir vendiendo en mostrador. Bloquear no cancela pedidos ni reservas anteriores.</p><Save/><Feedback state={state}/></form>;
}
