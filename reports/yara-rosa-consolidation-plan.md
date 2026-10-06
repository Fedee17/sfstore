# Yara Rosa: plan pre-apply

Estado: preparado localmente. No aplicado, sin commit ni deployment.

## Identidades

- A, unica identidad comercial: `f1cb2323-0e7f-49d6-a26f-110595c90e55`, `lattafa-yara-rosa`.
- B, identidad tecnica conservada: `05b34469-3eb8-4148-8e97-9a19f1c2df6e`, `perfume-yara-rosa`.
- Snapshot completo: `reports/yara-rosa-consolidation-pre.json`.
- Plan estructurado: `reports/yara-rosa-consolidation-plan.json`.

## Escrituras futuras autorizables

| Campo | A: actual -> final | B: actual -> final |
| --- | --- | --- |
| price | 87077.92 -> 87000 | 71763, conservar |
| transfer_price | 67050, conservar | 55257, conservar |
| cost | 44700, conservar | 32504, conservar |
| stock | 0 -> 1 mediante RPC | 1 -> 0 mediante RPC |
| featured | false -> true | true -> false |
| status | active, conservar | active -> archived |
| historical_identity | false, conservar | false, conservar |

No modificar nombres, slugs, SKU, categoria, textos, atributos, cost_source_purchase_item_id ni precios/costos de otros productos.
El trigger normal de products actualizara updated_at en A y B.

## Stock: operacion administrativa real, no historial inventado

Ejecutar en UNA transaccion PostgreSQL futura, no mediante dos requests independientes:

1. Bloquear ambas filas en orden determinista y revalidar el snapshot completo, referencias, imagenes y stock global. Abortar si algo cambio.
2. Identificar al administrador real mediante p_created_by, sin UUID ficticio.
3. Llamar a adjust_inventory_stock para B: 1 -> 0, motivo de reasignacion de identidad.
4. Llamar a adjust_inventory_stock para A: 0 -> 1, motivo de recepcion de la misma unidad fisica.
5. Aplicar solo los patches comerciales aprobados y archivar B dentro de esa misma transaccion.
6. Verificar stock global sin delta, historico sin cambios, dos movimientos adjustment y ningun sale/purchase nuevo. Ante fallo, rollback completo.

No se agrega migration ni una RPC nueva en esta preparacion. La ejecucion transaccional futura necesita acceso SQL autorizado y confirmacion humana; este plan no es un ejecutor.
Snapshot actual: 179 productos, stock global 101, 24 movimientos. Despues del apply esperado: 179 productos, stock global 101, 26 movimientos (dos ajustes administrativos genuinos).

## Historico

Conservar sin UPDATE las tres compras de B, sus tres purchase_items y tres historical_import_records.
Fechas: 2025-12-17, 2026-01-22 y 2026-07-30. Total: 112944.30.
Los mappings del importador historico siguen apuntando a B. No se reemplazan FKs ni snapshots.
B no es historical_identity: sus valores comerciales existentes y su historia no cumplen el modelo de identidad historica sin valores comerciales.

## Codigo local preparado

- Registro explicito central en lib/products/yara-rosa-consolidation.ts.
- Redirect permanente Next.js 308 de /producto/perfume-yara-rosa a /producto/lattafa-yara-rosa, antes de resolver la pagina y conservando query params.
- B excluida de catalogo, sitemap, consulta/recomendador, listado operativo de productos y selector de compras nuevas. Las ventas/pedidos mantienen filtros active y no historicos.
- Mutaciones normales de producto rechazadas para B; no puede reactivarse accidentalmente desde el formulario.
- Eliminado SOLO el fallback estatico Yara de precio 84500/stock 5. En fallo de Supabase no se inventa otra Yara.
- Ambos slugs resueltos hacia el ID exacto de A en Preview, confirmacion y sync. Si A no existe con ese ID/slug, abortar; no seleccionar B ni crear un sustituto.
- El importador conserva name/slug de A y mantiene los permisos y reglas actuales de cada hoja. El mapa de aliases utilizado por el historial no cambia.

## Imagenes

KEEP de ambas filas y objetos. Contenido identico: SHA-256 fbd16d47fd34145084f17767363f59309eb6f5f684f193850ea894913ea44182; 69834 bytes por objeto.
Los purchase_items no incluyen FK a product_images; la fila y objeto de B forman parte de la evidencia tecnica y del REVIEW versionado anterior.
No hace falta eliminar la imagen de B para lograr una sola identidad comercial. La retencion evita mezclar consolidacion con cleanup destructivo y conserva el estado primary/sort de ambas. Son 69.834 bytes adicionales.
Cualquier eliminacion futura requiere su propio plan, revalidacion de referencias y aprobacion. No se modifica el plan legacy ni se retira su proteccion REVIEW.

## Coordinacion y verificaciones

El codigo preparado oculta B incluso antes del archivo. No desplegarlo en una etapa aislada dejando A con stock cero.
Coordinar la transaccion de datos y publicacion del codigo con ventana controlada; hasta publicar, la URL de B aun no tiene el redirect nuevo.
Luego revalidar sitemap y catalogo con solo A, HTTP 308 de B y HTTP 200 de A, una Yara en consultas/selectores/recomendaciones y bloqueos operativos de B.
Verificar tres compras historicas intactas, imagenes sin cambios y ningun otro producto modificado.

El planner scripts/plan-yara-rosa-consolidation.ts solo consulta datos y guarda archivos locales. Rechaza cualquier flag, incluido --apply. No ejecutar importadores, inventario ni cleanup en esta fase.
