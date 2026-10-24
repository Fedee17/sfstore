"use client";
import {useActionState,useState} from "react";
import Link from "next/link";
import {saveComponentOfferImages} from "@/app/admin/productos/componentes/actions";

export type ComponentOfferImage = {id:string;url:string;alt:string|null;combo_connector:string|null};
export function ComponentOfferImageForm({recipeId,presentationId,images}:{recipeId:string;presentationId:string;images:ComponentOfferImage[]}) {
 const [cc,setCc]=useState(images.find(i=>i.combo_connector==="cc")?.id??"");
 const [lightning,setLightning]=useState(images.find(i=>i.combo_connector==="lightning")?.id??"");
 const [state,action,pending]=useActionState(saveComponentOfferImages,{message:""});
 const duplicated=Boolean(cc&&cc===lightning);
 return <form action={action} className="mt-4 grid gap-4 rounded-xl border bg-white p-4">
  <h2 className="text-lg font-semibold">Fotografías de los cargadores completos</h2>
  <p className="text-sm">Cada ficha muestra solamente la foto asignada a su conector. Sin asignación se mantiene «Imagen no disponible».</p>
  <Link href={`/admin/productos/${presentationId}/editar`} className="font-semibold underline">Administrar las fotos con el editor de producto existente</Link>
  <p className="text-sm">Cargá allí las fotos aprobadas del conjunto y volvé a esta pantalla. Conservá los demás datos del producto.</p>
  <input type="hidden" name="recipeId" value={recipeId}/>
  <div className="grid gap-4 sm:grid-cols-2">
   {([{key:"cc",label:"USB-C a USB-C",value:cc,set:setCc},{key:"lightning",label:"USB-C a Lightning",value:lightning,set:setLightning}] as const).map(field=>{
    const image=images.find(i=>i.id===field.value);
    return <div key={field.key} className="grid content-start gap-3">
     <label htmlFor={`${recipeId}-${field.key}`} className="font-semibold">Cargador completo {field.label}</label>
     <select id={`${recipeId}-${field.key}`} name={field.key} value={field.value} onChange={e=>field.set(e.target.value)} className="min-h-11 w-full min-w-0 rounded-lg border p-2">
      <option value="">Sin fotografía asignada</option>
      {images.map((i,index)=><option key={i.id} value={i.id}>Foto {index+1}{i.alt?` · ${i.alt}`:""}</option>)}
     </select>
     {image ? <img src={image.url} alt={`Vista previa: cargador completo ${field.label}`} className="h-40 w-full rounded-lg border object-contain"/> : <p className="text-sm">Imagen no disponible</p>}
    </div>;
   })}
  </div>
  {!images.length&&<p role="status">Todavía no hay fotografías cargadas en el producto de presentación.</p>}
  {duplicated&&<p role="alert">Elegí fotografías distintas: cada foto debe mostrar el conector correspondiente.</p>}
  <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="approved" value="yes" required className="mt-1"/>Verifiqué que cada foto elegida muestra el conjunto completo y el conector indicado.</label>
  <button disabled={pending||duplicated||!images.length} className="min-h-11 rounded-full bg-[#0072CE] px-5 py-3 font-semibold text-white disabled:opacity-50">{pending?"Guardando asociación…":"Guardar fotografías por conector"}</button>
  <p role="status" aria-live="polite">{state.message}</p>
 </form>;
}
