import type {CommercialListOptions} from "../commercial-reporting/list-reader.ts";

export function historyReadError(error: unknown) {
  return error instanceof Error && error.message === "COMMERCIAL_SEARCH_TOO_BROAD"
    ? "La búsqueda es demasiado amplia o no se pudo completar. Escribí un nombre o referencia más específico y reintentá."
    : "No se pudo completar la consulta. Revisá los filtros y reintentá; no se muestran resultados parciales.";
}

export function historyListHref(options:CommercialListOptions,page=options.page??1) {
  const params=new URLSearchParams({origin:options.origin??"all",page:String(page)});
  for(const key of ["channel","paymentStatus","date","search","from","to","month"] as const)if(options[key])params.set(key,options[key]!);
  return `/admin/${options.kind==="sales"?"ventas":"compras"}?${params}`;
}
export function historyDetailHref(path:string,options:CommercialListOptions) {
  return path+"?returnTo="+encodeURIComponent(historyListHref(options));
}
export function safeHistoryReturnPath(value:unknown,kind:"sales"|"purchases") {
  const fallback=`/admin/${kind==="sales"?"ventas":"compras"}`;
  if(typeof value!=="string")return fallback;
  try{const url=new URL(value,"https://sfstore.invalid");return url.origin==="https://sfstore.invalid"&&url.pathname===fallback?url.pathname+url.search:fallback;}catch{return fallback;}
}
