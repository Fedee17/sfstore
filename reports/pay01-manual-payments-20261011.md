# PAY-01 — Adaptación a pagos manuales

Fecha: 2026-10-11. Rama local: `codex/pay-01-atomic-checkout`; base integrada `69049e2` más SEC-01 y PAY-01 locales preexistentes. Clasificación RESTRINGIDA conservada. Implementación para revisión técnica; sin publicación, commit nuevo, activación ni acceso a Production. Los worktrees existentes permanecen preservados.

## Resultado implementado

- Checkout únicamente con transferencia o efectivo al retirar. Efectivo exige pickup y una política de precio explícita; no presupone descuentos ni precios. El cliente no envía importes confiables: cálculo, validación de productos/stock, creación y reservas siguen en la transacción idempotente existente.
- Mercado Pago inaccesible desde interfaces públicas. GET/POST de preferencia y webhook devuelven 410 incondicional, sin importar SDK, consultar credenciales/DB o efectuar cobros/conciliación. Retornos legacy redirigen al carrito. Código previo archivado server-only, sin callers activos ni bandera que lo reactive. Historial y etiquetas administrativas no se convierten ni eliminan.
- Pedidos nuevos pendientes, con método elegido persistido. `confirmed` describe la reserva/pedido, no acredita el pago. Recibo propio consulta ownership y `payment_status` del servidor; los parámetros de URL no acreditan pagos.
- `/admin/checkout` permite acreditar el importe completo tras reconocimiento expreso del administrador de haber recibido/verificado el dinero. Sesión getUser + allowlist preceden al cliente privilegiado; admin_id proviene de esa sesión. Transferencia exige referencia bancaria. La RPC registra evidencia auditada, confirma la reserva y registra el pago mediante el libro existente en una sola transacción. Fallos revierten todos esos efectos. Mismo pedido/clave reintenta idempotentemente; otro cobro del pedido o una referencia bancaria repetida en otro pedido se rechazan.
- Nuevo guard del libro de checkout: exige evidencia manual correspondiente y bloquea ediciones/borrados de pagos; guard del pedido impide acreditar sin evidencia/libro completo. Canales e históricos ajenos al nuevo checkout conservan su comportamiento.
- Liberación manual, hasta 100 vencimientos por acción administrativa. Selección pending/vencido, locks SKIP LOCKED, reloj DB y lifecycle existente. Fallo revierte ese pedido, registra su identificador/código en el resultado y permite reintento; otras liberaciones pueden completarse. Concurrencia/repetición no restituyen dos veces. Sin cron ni ejecución recurrente.

## Archivos de esta adaptación

| Área | Archivos |
| --- | --- |
| SQL candidato | `supabase/migrations/202610110003_pay01_manual_payments.sql` |
| Administración nueva | `app/admin/checkout/page.tsx`, `app/admin/checkout/actions.ts`, `components/admin/checkout-manual-forms.tsx`, `services/checkout-manual-admin.ts` |
| Navegación/checkout/recibo | `components/admin/admin-nav.tsx`, `app/carrito/page.tsx`, `app/checkout/page.tsx`, `app/checkout/exito/page.tsx`, `app/checkout/fallo/page.tsx`, `app/checkout/pendiente/page.tsx`, `app/producto/[slug]/page.tsx`, `services/checkout-buyer-receipt.ts` |
| Frontera/tipos | `lib/checkout/contract.ts`, `services/checkout-server.ts`, `services/orders.ts`, `lib/pricing.ts`, `lib/whatsapp.ts` |
| Mercado Pago inactivo | `app/api/mercadopago/create-preference/route.ts`, `app/api/mercadopago/webhook/route.ts`; originales archivados en `lib/payments/legacy-mercadopago/create-preference.ts` y `webhook.ts` |
| Pruebas | `tests/pay01-atomic-checkout.test.mjs`, `tests/pay01-checkout-boundary.test.mjs`, `tests/atomic-sales-inventory.test.mjs`, `tests/orders-workflow.test.mjs`, `tests/store-sales-checkout.test.mjs`, `tests/unified-sales-payments.test.mjs`, `tests/store-sale-custom-price.test.mjs` |
| Documentación | `docs/BUSINESS_RULES.md`, `docs/CHECKOUT_PAY01.md`, `docs/DEVELOPMENT_BACKLOG.md`, `docs/SECURITY_RULES.md`, `docs/SUPABASE_PERMISSIONS_SEC01.md`, este informe y `reports/pay01-manual-payments-read-only.sql` |

Los tests legacy de Mercado Pago conservan sus comprobaciones sobre el código archivado; nuevos tests verifican los handlers activos incondicionalmente bloqueados. Se quitaron variables de lectura sin uso, sin desactivar assertions o reglas. El diff total respecto de HEAD también incluye SEC-01 y PAY-01 anteriores; esta tabla identifica la adaptación, no atribuye esos cambios previos a este encargo. `202610110001` y `202610110002` se conservan sin modificación en esta adaptación.

## Validaciones y evidencia

Runtime: Node 24.19, PostgreSQL 18.4 efímero en loopback, fixtures sintéticos, Chromium local para la suite que lo requiere. Sin credenciales productivas, APIs de pagos ni escrituras remotas.

| Validación | Resultado |
| --- | --- |
| `node --test tests/pay01-atomic-checkout.test.mjs tests/pay01-checkout-boundary.test.mjs` | 55/55; cero fallos/omisiones, incluye SQL read-only extendido |
| `node --test tests/*.test.mjs` | 714/714; cero fallos/omisiones |
| `npm run build` | Correcto; rutas administrativas/checkout generadas |
| `npx tsc --noEmit` después del build | Correcto |
| `npm run lint` | 0 errores; 11 advertencias preexistentes |
| ESLint del test tras ampliar verificación SQL | Correcto |
| `git diff --check` | Correcto |

Para reproducir las pruebas opcionales se usaron `SFSTORE_TEST_PG_BIN=/tmp/sfstore-pg-runtime/node_modules/@embedded-postgres/linux-x64/native/bin`, `SFSTORE_TEST_PG_MODULE=/workspace/sfstore-pay01/node_modules/pg/lib/index.js` y `SFSTORE_TEST_PLAYWRIGHT_MODULE=/tmp/sfstore-p1-playwright.cjs`. Son ubicaciones del runtime local, no credenciales/configuración productiva.

Evidencia temporal: `/tmp/sfstore-manual-specific-verification.log`, `/tmp/sfstore-manual-full-final.log`, `/tmp/sfstore-manual-build-final.log`, `/tmp/sfstore-manual-tsc-final.log`, `/tmp/sfstore-manual-lint-final.log`, `/tmp/sfstore-manual-verification-lint.log`. Estos logs no se versionan. El informe PAY-01 anterior conserva su evidencia histórica de 696 tests.

Las pruebas ejercitan PostgreSQL real: creación/precios/stock/idempotencia, efectivo sin configuración y con ambas políticas explícitas, autorización SQL pública denegada, pago manual completo, referencia duplicada, ejecución concurrente/repetida, expiración concurrente y fallo inyectado de libro/liberación con rollback y reintento. Frontera TS/React con mocks sintéticos: autorización administrativa real getUser/allowlist, identidad administrativa no falsificable, comprador sin acceso a crédito/liberación, handlers MP 410, render público sin MP, cash solo retiro y recibo que distingue confirmed de paid. No equivalen a una prueba end-to-end del deployment ni verifican el banco.

## Migraciones y compatibilidad SEC-01

Pendientes de revisión/aplicación autorizada, ninguna ejecutada en Production:

1. Prerequisitos Storage del baseline: `202610100001_product_storage_task_results.sql` y `202610100002_durable_admin_image_delete.sql`.
2. `202610110001_sec01_effective_permissions.sql`.
3. `202610110002_pay01_atomic_checkout.sql`.
4. Nueva `202610110003_pay01_manual_payments.sql`.

La nueva migration añade tabla de recibos y columna nullable cash_price_policy, amplía la constraint del método con cash conservando mercadopago histórico, reemplaza funciones/guard de checkout y añade guard/RPC manuales. No siembra configuración ni modifica filas históricas. Reemplazar funciones/constraints/triggers requiere revisión de esquema y locks; no es una migration únicamente aditiva. SQL y callers deben revisarse como conjunto; no aplicar SEC-01 aisladamente al checkout anterior.

Matriz: anon/authenticated mantienen catálogo limitado SEC-01 y carecen de lecturas/escrituras/EXECUTE sobre configuración, operaciones y recibos. Admin allowlisted conserva ese rol SQL público, pero las acciones autorizadas usan service_role exclusivamente en servidor. Service_role es una frontera confiable, no prueba por sí mismo la identidad humana: la comprueba el caller administrativo. Nadie debe exponer este cliente ni crear callers sin guard.

El SQL read-only extendido comprueba en fixture fresco: tres tablas con RLS, cero ACL públicas indebidas, cero EXECUTE público, ocho funciones invoker con EXECUTE de servicio y cero configuración/operaciones/recibos. Production no fue consultada y puede tener objetos/grants ajenos al repositorio; la validación local no certifica su esquema efectivo.

## Decisiones y límites antes de habilitar

Los dos métodos manuales y cash solo retiro ya fueron autorizados por el propietario; no necesitan volver a decidirse. Pendiente:

- Duración/estrategia de reserva: plazo compartido explícito actual, o extensión por método/prórroga bajo reglas aprobadas. Frecuencia operativa de liberación manual y tratamiento de pagos tardíos. Las alternativas están en CHECKOUT_PAY01; no se inventaron plazos ni procesos recurrentes.
- Política de precio de efectivo: lista o transferencia; precio vigente frente al carrito/reconfirmación. UI muestra estimación, nunca fija el importe final.
- Métodos y condiciones de entrega, tarifas/cobertura; no se presume retiro gratis. Efectivo solo permite retiro.
- Autorización del comprador y acceso autenticado frente a invitados. El adaptador implementado exige sesión verificada; invitados no están implementados ni habilitados. No se desarrolló login/registro comprador nuevo.
- Cobros parciales, total cero, devoluciones y dinero recibido después de vencer/cancelar requieren contrato adicional; no se acreditan mediante esta operación ni reviven reservas automáticamente.
- Política operativa sobre unicidad de referencia bancaria: actualmente una misma referencia de transferencia no puede acreditar dos pedidos distintos. Revisar el formato de referencia usado y cuentas antes de habilitar.
- Revisión humana de cambios de pagos/permisos y migrations contra esquema real, más autorización separada para aplicación/publicación/configuración. Mercado Pago permanece diferido; no hace falta PAY-02 para este checkout manual.

Sin activación comercial, la configuración vacía devuelve checkout no configurado. No se añadieron tarifas, duraciones, procesos recurrentes o permisos autónomos. Próximo paso: revisar el diff y aprobar las reglas pendientes para preparar una configuración y rollout coherente; este encargo termina aquí.
