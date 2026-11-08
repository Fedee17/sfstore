"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {logoutAdmin} from "@/app/admin/login/actions";
import {PendingSubmitButton} from "@/components/admin/pending-submit-button";

const groups=[
  {label:"Ventas y pedidos",links:[["/admin/ventas","Ventas"],["/admin/pedidos","Encargos y entregas"],["/admin/checkout","Pedidos de la web"]]},
  {label:"Productos y stock",links:[["/admin/consulta","Consulta rápida"],["/admin/productos","Productos"],["/admin/inventario","Disponibilidad y reposición"],["/admin/inventario?view=movements","Movimientos"],["/admin/productos/familias","Familias y variantes"],["/admin/productos/componentes","Cargadores"]]},
  {label:"Compras",links:[["/admin/compras","Compras"],["/admin/proveedores","Proveedores"]]},
  {label:"Informes",links:[["/admin/analytics","Resumen mensual"]]},
];
const item="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-offset-2";
export function AdminNav(){
  const pathname=usePathname();
  function active(href:string){
    if(href.includes("?"))return false;
    const matches=groups.flatMap(group=>group.links).map(([path])=>path).filter(path=>!path.includes("?")&&(pathname===path||pathname?.startsWith(path+"/")));
    return href===matches.sort((a,b)=>b.length-a.length)[0];
  }
  return <header className="border-b border-[#8B5E3C]/15 bg-[#F7F4ED]">
    <div className="mx-auto max-w-6xl px-4 py-3 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="font-semibold text-[#1F1F1F]">SFSTORE Admin</Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/ventas/nueva" className="inline-flex min-h-11 items-center rounded-full bg-[#556B2F] px-4 text-sm font-semibold text-white hover:bg-[#465826]">Nueva venta</Link>
          <Link href="/admin/configuracion" className="text-sm font-semibold text-[#465826]">Datos de la tienda</Link>
          <form action={logoutAdmin}><PendingSubmitButton pendingLabel="Cerrando..." className="min-h-11 px-2 text-sm font-semibold text-black/65">Cerrar sesión</PendingSubmitButton></form>
        </div>
      </div>
      <nav aria-label="Administración" className="mt-2 flex flex-wrap items-start gap-1">
        <Link href="/admin" aria-current={pathname==="/admin"?"page":undefined} className={item+(pathname==="/admin"?" bg-[#556B2F]/10 text-[#465826]":"")}>Inicio</Link>
        {groups.map(group=><details key={group.label} name="admin-navigation" className="relative max-w-full" onKeyDown={event=>{if(event.key==="Escape"){event.currentTarget.removeAttribute("open");event.currentTarget.querySelector("summary")?.focus();}}}>
          <summary className={"min-h-11 cursor-pointer rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-offset-2"+(group.links.some(([href])=>active(href))?" bg-[#556B2F]/10 text-[#465826]":"")}>{group.label}</summary>
          <div className="z-50 mt-1 grid w-64 max-w-full gap-1 rounded-xl border border-[#8B5E3C]/20 bg-white p-2 shadow-lg lg:absolute lg:left-0">
            {group.links.map(([href,label])=><Link key={href} href={href} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")} aria-current={active(href)?"page":undefined} className={item+(active(href)?" bg-[#556B2F]/10 text-[#465826]":"")}>{label}</Link>)}
          </div>
        </details>)}
      </nav>
    </div>
  </header>;
}
