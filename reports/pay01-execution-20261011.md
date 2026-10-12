# PAY-01 — Ejecución local verificable, 2026-10-11

## Resultado y procedencia

Implementación técnica candidata en `codex/pay-01-atomic-checkout`, worktree `/workspace/sfstore-pay01`, HEAD base integrada `69049e2`. Se copió el snapshot local completo de SEC-01 desde su worktree sin modificarlo, porque todavía no tenía commit. Los worktrees existentes y sus cambios se preservaron. No se crearon commits, no hubo push, merge, deploy, llamadas a Production, credenciales productivas ni migrations remotas. La rama mantiene cambios locales revisables.

PAY-01 permanece RESTRINGIDA, IMPLEMENTACIÓN LOCAL EN REVISIÓN. La transacción, autorización, idempotencia y estados están implementados y probados; la habilitación pública está bloqueada por decisiones comerciales y configuración vacía. No se certifica readiness de Production ni se completa PAY-02.

## Comportamiento implementado

- Checkout cliente deja de insertar clientes/pedidos/ítems con anon y deja de enviar precios, descuentos, gastos y totales. Identificadores de producto/cantidades viajan al servidor; la UI muestra solo estimaciones.
- Handler JSON de mismo origen, cuerpo acotado, contrato estricto y sesión getUser verificada. Identidad del comprador obtenida en servidor, nunca del body. Errores expuestos por códigos conocidos sin diagnósticos DB/PII.
- RPC service-only valida catálogo vigente compatible con SEC-01, bloquea productos/categorías, calcula numeric exacto y crea todas las filas/reservas/resultados en una transacción. Ítems tienen product_id real. Se conserva channel=web y contratos de canales administrativos.
- Idempotencia por comprador/UUID, hash SHA-256 nativo PostgreSQL sin dependencia del esquema de pgcrypto, ítems canonizados y conflicto ante reutilización con otra solicitud. Clave persistida antes del envío para reintento tras respuesta perdida; lock síncrono UI contra doble envío.
- Reserva reduce disponibilidad, registra movimientos, libera una sola vez al cancelar/expirar y convierte evidencia al confirmar sin doble descuento. Estados explícitos independientes del workflow histórico. Clock de DB comprobado tras esperar inventario. Guards impiden edición financiera/ítems y bypass desde RPC de venta existente.
- Recibo propio autorizado mediante buyer_id+order_id; ignora importes/números de URL y no da instrucciones de transferencia para reservas vencidas/terminales. Se conserva acceso administrativo allowlisted a pedidos anteriores.
- Configuración vacía y sin seed: duración, autorización, precio vigente y entrega/tarifa/cobertura deben elegirse explícitamente. Envíos sin destino permitido o configuraciones ambiguas se rechazan; no hay retiro gratis, reserva temporal ni cobertura global por defecto.
- No se invoca Mercado Pago desde el nuevo checkout. UI/contrato bloquean MP y preference/webhook heredados rechazan nuevos pedidos checkout_version=1 antes de crear preferencias o escribir pagos/inventario. PAY-02 sigue pendiente.

Arquitectura, matriz y contratos: [CHECKOUT_PAY01.md](../docs/CHECKOUT_PAY01.md).

## Evidencia técnica

Runtime: Node 24.19.0, PostgreSQL 18.4 efímero en loopback, Chromium 151.0.7922.173 mediante el fixture existente. Dependencias instaladas con npm ci y lockfile vigente; no se actualizaron paquetes. Todas las filas fueron sintéticas y las DB se eliminaron al terminar. No se eliminaron archivos de Storage ni se activaron procesadores.

| Validación final | Comando / evidencia | Resultado |
| --- | --- | --- |
| PAY-01 específico | `SFSTORE_TEST_PG_BIN=... node --test tests/pay01-atomic-checkout.test.mjs tests/pay01-checkout-boundary.test.mjs`; `/tmp/sfstore-pay01-specific-final.log` | 37/37, 0 skips |
| Compatibilidad tests existentes actualizados | `node --test tests/orders-workflow.test.mjs tests/store-sale-custom-price.test.mjs tests/store-sales-checkout.test.mjs tests/unified-sales-payments.test.mjs`; `/tmp/sfstore-pay01-compatibility.log` | 94/94 |
| Suite completa con runtimes DB/browser | comando abajo; `/tmp/sfstore-pay01-full-final.log` | 696/696, 0 errores, 0 skips |
| Build | `npm run build`; `/tmp/sfstore-pay01-build-final.log` | exit 0 |
| TypeScript después de build | `npx tsc --noEmit`; `/tmp/sfstore-pay01-tsc-final.log` | exit 0 |
| ESLint global | `npm run lint`; `/tmp/sfstore-pay01-lint-final.log` | exit 0; 0 errores, 11 advertencias preexistentes |
| Integridad del diff | `git diff --check` | exit 0 |
| SQL de verificación | `reports/pay01-permissions-read-only.sql` ejecutado en DB sintética antes de configurar | RLS/ACL/funciones/triggers correctos; ninguna activación/operación sembrada |

Comando exacto de suite general en este entorno:

```sh
SFSTORE_TEST_PG_BIN=/tmp/sfstore-pg-runtime/node_modules/@embedded-postgres/linux-x64/native/bin \
SFSTORE_TEST_PG_MODULE=/workspace/sfstore-pay01/node_modules/pg/lib/index.js \
SFSTORE_TEST_PLAYWRIGHT_MODULE=/tmp/sfstore-p1-playwright.cjs \
node --test tests/*.test.mjs
```

Pruebas nuevas: concurrencia con igual clave y compradores compitiendo por stock; confirmación/cancelación simultáneas; expiración durante espera de lock; orden canónico e idempotencia cruzada entre compradores; precio manipulado y cliente falso; stock insuficiente multiítem; productos/categorías inactivos, históricos, ausentes y Yara excluido; precio transferencia por encima de lista sin descuento inventado; importes decimales y tarifa de servidor; rollback ante error después de descontar; cancelación/expiración repetidas; rechazo de transición tardía/terminal; compatibilidad con apply_sale_inventory; intento de editar importes/ítems o agregar líneas; autorización HTTP/getUser/ownership de recibos; límite streaming/cross-origin; errores sin filtraciones; reintento cliente tras respuesta perdida; bloqueo MP; grants/RLS SEC-01 y verificación SQL sin activación.

## Incidencias resueltas

Las primeras ejecuciones detectaron precedencia de operadores JSONB y una referencia de stock ambigua en PL/pgSQL. Se corrigieron con el error y consulta concretos de PostgreSQL; no se relajaron controles. El fixture histórico se corrigió para cumplir las constraints reales de identidad, incluyendo grupo, stock cero y precios/descripción nulos. No se modificó el esquema para acomodarlo.

ESLint detectó Date.now durante render; la comprobación se llevó al lector servidor, conservando el bloqueo por expiración. La primera suite general tuvo cinco fallos estáticos que exigían la forma de los antiguos inserts públicos; se actualizaron cuatro archivos de pruebas para verificar el canal web en la nueva RPC y el contrato HTTP. La prueba real comprueba además channel=web persistido. No se desactivaron ni omitieron casos. La suite final pasó completa.

## Archivos PAY-01 (23; respecto del snapshot SEC-01)

- `app/api/checkout/route.ts`
- `app/api/mercadopago/create-preference/route.ts`
- `app/api/mercadopago/webhook/route.ts`
- `app/checkout/page.tsx`
- `app/checkout/exito/page.tsx`
- `lib/checkout/contract.ts`
- `lib/checkout/http.ts`
- `services/orders.ts`
- `services/checkout-server.ts`
- `services/checkout-buyer-receipt.ts`
- `supabase/migrations/202610110002_pay01_atomic_checkout.sql`
- `tests/pay01-atomic-checkout.test.mjs`
- `tests/pay01-checkout-boundary.test.mjs`
- `tests/orders-workflow.test.mjs`
- `tests/store-sale-custom-price.test.mjs`
- `tests/store-sales-checkout.test.mjs`
- `tests/unified-sales-payments.test.mjs`
- `docs/CHECKOUT_PAY01.md`
- `docs/DEVELOPMENT_BACKLOG.md`
- `docs/SECURITY_RULES.md`
- `docs/SUPABASE_PERMISSIONS_SEC01.md`
- `reports/pay01-permissions-read-only.sql`
- `reports/pay01-execution-20261011.md`

Otros cambios visibles contra HEAD son el snapshot SEC-01 ya existente: migration SEC-01, lector administrativo, server-only, fixture Storage, pruebas y reports previos. No son reimplementaciones PAY-01. Package.json/lockfile, Next.js y xlsx no se modificaron.

## Migrations y compatibilidad pendiente

Nueva candidata: `202610110002_pay01_atomic_checkout.sql`. Añade dos tablas, índices, cinco funciones y tres triggers. No siembra configuración, altera datos históricos ni habilita pagos/checkout/jobs. Requiere SEC-01; el test aplica secuencialmente todo el baseline en PostgreSQL aislado. Nuevas tablas tienen RLS/grants explícitos y cinco RPC/functions sin EXECUTE público.

Pendientes previas: `202610100001_product_storage_task_results.sql`, `202610100002_durable_admin_image_delete.sql` y `202610110001_sec01_effective_permissions.sql`. Ninguna se aplicó en Production. La compatibilidad está demostrada contra migrations versionadas/fixtures, no contra el esquema efectivo remoto.

SQL read-only preparado: [pay01-permissions-read-only.sql](pay01-permissions-read-only.sql), complementario al de SEC-01. Tras aplicar la migration sin configurar, se esperan dos tablas con RLS, cero filas de privilegios prohibidos, cinco funciones ejecutables solo por servicio, tres triggers habilitados, configuration_rows=0, enabled_configurations=0 y checkout_rows=0. Esto no autoriza ejecutarlo ni aplicar DDL remoto en esta fase.

## Decisiones y bloqueos de habilitación

1. Aprobar duración y estrategia de reserva sobre disponibilidad. Precisar cómo se hará la expiración operativa y cómo se contarán unidades reservadas en ajustes/reconciliación administrativa. No hay job/caller de expiración habilitado: el plazo por sí solo no libera unidades.
2. Aprobar método(s), tarifas y destinos de entrega. Configurar retiro no implica gratuidad; shipping exige cobertura explícita. Si se necesitan tarifas variables o otra cobertura, definir el contrato antes de implementarlo.
3. Elegir precio vigente al confirmar frente a cotización congelada/reconfirmación. Solo current_catalog está preparado; no se habilitó esa decisión comercial.
4. Elegir sesión autenticada frente a invitado con autorización/capacidad verificable. Está preparado el adaptador autenticado, no un signup/login nuevo ni capacidades de invitados. Guest mode falla cerrado. Definir medidas comerciales frente a abuso de reservas antes de abrir acceso.
5. Revisar guards y contrato de confirmación con PAY-02. Confirmed no prueba pago aprobado; la conciliación debe diseñarse como unidad segura con el libro de pagos. No llamar al nuevo lifecycle desde el webhook anterior.
6. Revisar el snapshot SEC-01 y compatibilidad real del esquema mediante acceso read-only autorizado; después aprobar por separado aplicación de migrations e integración/despliegue. SEC-01 aislado rompe el checkout anterior y PAY-01 sin configuración aprobada permanece cerrado.

Próximo paso: revisión técnica conjunta de SEC-01/PAY-01 y aprobación de estas reglas para completar la habilitación en entorno de pruebas independiente. Mantener Production sin cambios. No se inició ninguna otra tarea.
