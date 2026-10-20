# Inventario de cargadores por componentes

> Actualización 20/10/2026: los precios individuales y el precio especial de combo ya fueron aprobados. La implementación posterior se documenta en [Precio especial por combo](CHARGER-COMBO-PRICING.md). Las menciones siguientes a precios pendientes o a dos líneas individuales describen el estado de la entrega `e429ab78`; quedan sustituidas por esa continuación. Se conservan como evidencia del motor y su validación. No se aplicó nada en Production.

Implementación local en `codex/charger-components-20261019`, continuación de `053aebf`. No publicada ni aplicada en Production. El reparto de costos aprobado se conserva; no requiere otra decisión sobre costos o envío.

## Contrato implementado

- Migración `202610190001_component_inventory.sql`: recetas, composición de recepciones, operaciones de conversión, reversión y aprobación separada de precios. RLS habilitado; auditoría y RPC administrativas inaccesibles para `anon` y `authenticated`. No agrega funciones `SECURITY DEFINER`.
- Un conjunto comercial agrega **dos líneas con sus `products.id` reales**: un cabezal y el cable elegido. No tiene stock propio, reserva propia, precio de paquete ni otra fuente de disponibilidad. El precio es la suma de los precios vigentes de los componentes, con el redondeo y descuento por SKU existentes. Un eventual precio especial de paquete queda fuera del contrato implementado.
- Se conserva `create_store_sale_atomic`, `create_checkout_atomic` y el circuito de acreditación/cancelación. Se usan sus bloqueos, pagos, reservas e idempotencia sin reescribir sus funciones. Los pedidos, historial y comprobantes conservan las dos líneas y sus nombres/SKU reales.
- `confirm_purchase` conserva nombre y argumentos. Para una compra sin conjuntos delega al contrato anterior. Para conjuntos exige composición explícita, bloquea los SKU por ID, confirma y convierte dentro de la misma transacción. Un trigger diferido impide confirmar por la función base sin completar la conversión.
- Las recepciones posteriores pueden tener otro reparto de conectores, incluso cero de uno de ellos. Se admite **una composición de conjuntos por compra**, junto con otros artículos; no se admiten los mismos componentes también como líneas directas de esa compra. Los componentes comprados individualmente siguen el circuito anterior.

## Conversión de la compra existente

`get_component_conversion_plan` es de lectura. `apply_component_conversion` exige clave de operación, actor y huella **SHA-256** del estado leído. Repite las comprobaciones bajo bloqueos y registra estado anterior/posterior, compra, receta, movimientos, valores exactos y residuales. Una misma clave/contenido devuelve el resultado anterior; contenido distinto, otra conversión de la compra o una operación revertida se rechazan.

Resultado ensayado con datos sintéticos representativos:

| Existencia | Cambio | Resultado previsto si el preflight coincide |
|---|---:|---:|
| Conjuntos de origen | −20 | 0 |
| Cabezal existente | +20 sobre la unidad previa | 21 |
| Cable USB-C a USB-C nuevo | +10 | 10 |
| Cable USB-C a Lightning nuevo | +10 | 10 |
| Cable histórico sin conector | 0 | 0 |
| Presentación comercial del combo | 0 | 0 |
| Otro modelo USB-A a USB-C | Ninguno | Intacto |

No se borra, duplica, reabre ni reescribe la compra original. Se conservan sus líneas, recepción y referencias históricas. La conversión genera movimientos `adjustment` identificados con su operación, no otra compra ni una venta ficticia.

### Valor y costo previo

El proveedor se reparte 50/50 y el envío una sola vez entre 49 piezas. Totales exactos: cabezales $66.508,77; C/C $33.254,39; C/Lightning $33.254,39; nueve vapers $124.113,95. Total $257.131,50. Reclasificación compensada: +$2.153,41 a componentes y −$2.153,41 al otro artículo. Los residuales unitarios −$0,03/−$0,01/−$0,01/−$0,01 permanecen explícitos en la auditoría.

El costo del lote nuevo del cabezal es $3.325,44 por unidad redondeada. La unidad previa a $3.650 se conserva en el estado de apertura de la auditoría y en sus referencias históricas. El costo **vigente** del SKU combina ambas existencias: $3.340,89 redondeado. No equivale a modificar el costo histórico de esa unidad ni de ventas anteriores. No se atribuye el componente a una línea de compra de otro producto: se limpia esa referencia y se registra `cost_source_component_operation`.

El valor exacto del lote, su residual y el estado de apertura son la evidencia de conservación; no se afirma que `stock × costo vigente redondeado` reproduzca ese valor exacto. La ponderación utiliza el stock disponible del contador actual, conservando los snapshots históricos existentes; no incorpora FIFO ni otro libro de stock.

La conversión inicial **se detiene** si los conjuntos o los nueve artículos del lote ya tienen salidas, reservas, cambios de costo/fuente u otros movimientos no conciliados. No corrige ventas anteriores ni distribuye su costo silenciosamente. Las recepciones nuevas sí preservan reservas existentes de componentes y ponderan el costo previo de otras existencias.

## Administración y tienda

- `/admin/productos/componentes`: asociación explícita de seis SKU existentes. Reutilizar el cabezal, crear únicamente los dos cables diferenciados como borradores desde Productos y conservar el cable genérico histórico. La asociación es fija; un reintento idéntico devuelve la misma receta. Registrar la receta excluye de venta directa el conjunto fuente, presentación y cable genérico; **no convierte stock ni modifica precios**.
- `/admin/compras/[id]`: en borradores con conjuntos se declaran cantidades por conector antes de confirmar; en compras convertidas se muestran recepción, totales exactos y residuales junto al registro original, de lectura.
- `/admin/ventas/nueva`: selección de conjunto con cable explícito; agrega ambas líneas o ninguna. La búsqueda individual continúa disponible. Pagos completos y combinados usan la regla existente de la venta física.
- Ficha pública del cabezal: selector de cable y disponibilidad derivada; el carrito conserva ambos SKU, consolida cantidades con artículos individuales y rechaza adiciones parciales. La proyección pública no incluye costos, fuente histórica ni auditoría. Sin aprobación comercial no ofrece combos.
- `approve_component_prices` permite una **futura aprobación explícita**, con actor, clave e importes esperados exactamente iguales a los ya almacenados. No cambia precios y no se invoca desde la configuración de recetas. Un cambio posterior de precio revoca automáticamente la disponibilidad del combo hasta revisar esa aprobación. Esta función solo se ejercitó con precios sintéticos.

**Pendiente comercial vigente:** precios del cabezal y de ambos cables. Se conservan los precios anteriores como referencia; no se aprobaron ni aplicaron valores nuevos. El combo permanece sin venta conjunta habilitada. Los precios no bloquean el desarrollo ni los ensayos con importes sintéticos.

## Preflight, dry-run y ejecución futura

No se ejecutó nada en Production. La aplicación de la migración, creación/asociación de SKU reales, conversión y aprobación de precios requieren revisión y autorización específica.

1. Obtener respaldo reciente recuperable y una lectura puntual del esquema, compra, líneas, stocks, costos, fuentes de costo, movimientos y reservas. Comparar con la evidencia aprobada; no reutilizar la captura anterior como prueba de vigencia.
2. Revisar dependencias y hashes del candidato/migración. Ensayar el contrato sobre una copia **aislada**. No sustituir scripts de migración históricos ni usar `db push` indiscriminadamente.
3. Verificar los seis SKU exactos: conservar el ID del cabezal, genérico histórico en cero y USB-A/C fuera de la receta. Dos cables nuevos en cero y borrador, sin inventar fotografías ni precios. Presentación en cero. La asociación es una acción aparte: no esconderla dentro de un preflight de lectura.
4. Con el contrato aprobado ya instalado, `reports/charger-components-preflight-read-only.sql` sirve como plantilla de lectura con límites y rollback. La vista previa no certifica por sí sola la elegibilidad: el ejecutor vuelve a verificarla bajo locks.
5. Revisar cantidades **20 → 20 + 10 + 10**, apertura del cabezal **1 → 21**, el otro lote de **9**, importes, residuales y ausencia de actividad posterior. Si difieren, detenerse; no adaptar automáticamente la compra ni el stock.
6. Conservar la huella SHA-256 del plan revisado y la clave de operación. El ejecutor usa timeout de bloqueo 3 s y sentencia 30 s en el SQL generado. Ejecutar solo una vez tras autorización. Ante resultado incierto, consultar `component_inventory_operations` por clave/compra antes de cualquier reintento.
7. Comprobar stocks, costo vigente, referencias históricas, valor total exacto, movimientos por operación y ausencia de modificaciones al otro cable. Confirmar que los combos siguen sin aprobar precios ni estar publicados.

### Auxiliar local, sin acceso a Production

`scripts/component-inventory.mjs` acepta únicamente loopback para las conexiones; no lee `.env`, URLs ni credenciales productivas. Su manifiesto privado contiene `purchaseId`, `recipeId`, `operationKey`, `actorId`, `cc:10` y `lightning:10` (UUID de fixtures locales durante los ensayos). Guardar manifiesto/resultados en `staging/runtime/`, ignorado por Git.

```powershell
node scripts/component-inventory.mjs --mode preflight --manifest staging/runtime/component-manifest.json --port PUERTO_LOCAL --output staging/runtime/component-plan.json
node scripts/component-inventory.mjs --mode apply-local --manifest staging/runtime/component-manifest.json --port PUERTO_LOCAL --fingerprint HUELLA_SHA256
node scripts/component-inventory.mjs --mode review-sql --manifest staging/runtime/component-manifest.json --fingerprint HUELLA_SHA256 --output staging/runtime/component-review.sql
```

Los archivos de salida se crean sin sobrescribir otros. `review-sql` **no conecta ni ejecuta SQL**, solo prepara la transacción para revisión posterior. No utilizar sus UUID locales en Production. El mecanismo no evade la autorización pendiente ni convierte una captura nueva en aprobación de modificaciones.

## Recuperación

Un error de ejecución revierte conjuntamente stock, costos, movimientos y auditoría de la transacción. No repetir ciegamente ante timeout/conexión incierta: leer primero la clave de operación y el estado de la compra.

`reverse_component_conversion(clave_reversion, clave_original, actor, motivo)` restaura stocks/costos/fuentes de apertura mediante movimientos compensatorios y registro inmutable, **solo** si el estado posterior sigue exacto y no hubo movimientos posteriores. El reintento idéntico no vuelve a mover stock. Si hubo venta, reserva, liberación, recepción u otra edición, rechaza la reversión: mantener la composición y conciliar hacia adelante con nueva revisión. No borrar ni restaurar la compra original, ni sobrescribir Production desde un respaldo. La receta y sus exclusiones de venta permanecen; la reversión no reabre la venta de conjuntos de origen.

## Validación y límites

Se ejecutaron pruebas sintéticas en PostgreSQL **17.6 descartable**, con tmpfs, puerto loopback y roles separados; los contenedores propios se retiraron. No se tocó el Supabase local del checkout ni se usaron credenciales productivas. Las pruebas comprueban conservación, lote previo, idempotencia, cambio de huella, concurrencia, fallos parciales, cancelación, reservas activas/pagadas, acreditación repetida, precisión, historial, denegación pública, auxiliar local y aprobación explícita de precios.

La suite de aplicación incluye carrito real y componentes renderizados, además de adaptadores de autorización de Server Actions. No equivale a un ensayo completo de UI/Auth/PostgREST en Supabase ni a una revisión visual. La verificación visual de notebook y celular sigue pendiente por la prohibición de navegador/escritorio; se prepararon grillas responsive, selectores etiquetados, objetivos de al menos 44 px, botones deshabilitados sin selección, estados pendientes y mensajes accesibles. No se activó analítica nueva; una futura medición puede registrar selección de conector y adición conjunta sin IDs personales ni costos.

El panel de rentabilidad todavía trata una procedencia de compra que no puede comprobar como no verificada: la nueva referencia de conversión no se presenta falsamente como compra directa certificada. Incorporar esa evidencia a métricas de lotes es trabajo posterior; los snapshots actuales de ventas sí congelan el costo vigente de cada SKU.

**Estado:** preparado y ensayado localmente para revisión. Bloqueos de publicación: lectura/preflight fresco y respaldo, aprobación de SQL/conversión/publicación, aprobación de precios y revisión visual/ensayo de interfaz cuando sea seguro. No faltan decisiones sobre el reparto 50/50 ni las 49 piezas.

### Resultados de cierre

- Suite general: **857 aprobadas, 0 fallos, 13 omisiones opcionales** (`node --test tests/*.test.mjs`). No se presentan omisiones como pases.
- PostgreSQL real aislado: **36 aprobadas, 0 fallos, 0 omisiones**: 27 del motor/compatibilidad y 9 regresiones comerciales de variantes (`SFSTORE_TEST_DOCKER` + los dos archivos `component-inventory-postgres.test.mjs` / `product-variants-commerce-postgres.test.mjs`). Incluye familias ordinarias recibidas/vendidas con el nuevo contrato de componentes instalado. Los contenedores propios se retiraron.
- `npm run build`, `npx tsc --noEmit`, ESLint focalizado y `git diff --check`: aprobados. Lint general: cero errores y nueve advertencias de imágenes preexistentes.
- Gitleaks sobre el diff preparado: sin secretos detectados; informes privados, datos capturados y respaldos excluidos del commit.
- Huella SHA-256 del SQL ensayado con bytes LF: `6370625fcf4a20c66dfeb1e0275a9784d0a6bcb88230720826cc80f1e0a705e3`. Antes de una futura autorización comparar el archivo exacto; no interpretar una conversión de saltos de línea como aprobación de otro archivo.
