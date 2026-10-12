# PAY-01 — Reglas comerciales aprobadas

Fecha: 2026-10-11. Rama independiente `codex/pay-01-approved-commercial-rules`, worktree `/workspace/sfstore-pay01-rules`, HEAD base `69049e2`. Se copió íntegramente el snapshot local de PAY-01/SEC-01 sin confirmar a este worktree; el original `/workspace/sfstore-pay01` conserva sus 50 archivos modificados/nuevos byte por byte. No se crearon commits, push, merges ni despliegues. No se consultó ni modificó Production.

## Implementación

1. Reservas de **24 horas** para transferencia y efectivo: reloj DB y vencimiento congelado en la operación. Reintento no renueva plazo. Para crear pedidos nuevos, configuración explícita de 86400 segundos; un plazo antiguo/arbitrario se rechaza. No se reescriben vencimientos existentes ni se activan tareas recurrentes.
2. Descuento único de **25%** en cada producto válido: `round(products.price * 0.75, 2)` por unidad, multiplicado por cantidad. `price` es la base de lista real del modelo; `transfer_price` ya diferenciado no se vuelve a descontar ni determina la nueva regla. Lista 100 con diferenciado 75/80/50/120 cobra 75. El subtotal de lista, descuento y total se calculan con numeric en servidor; el envío se suma según configuración, sin descuento. Redondeo monetario por unidad a centavos; porcentajes visibles pueden diferir en valores mínimos por ese redondeo.
3. Precio final congelado en pedido, ítems y resultado idempotente al crear. Cambios posteriores del catálogo o configuración no alteran el cobro ni un reintento del mismo pedido. Los guards de inmutabilidad existentes permanecen. No hay actualización del catálogo ni repricing histórico.
4. Liberación manual del stock pendiente/vencido: conserva locks, SKIP LOCKED, transacción por pedido y reintentos. Exclusión explícita de paid, pagos aprobados y evidencia manual, comprobada nuevamente en el lifecycle bajo lock. Un pedido pagado no libera stock aunque venza su plazo o haya inconsistencia sintética de estado. Cancelación también queda protegida frente a acreditación.
5. Retiro y envío disponibles; efectivo conserva **pago al retirar en local**, no se interpreta como efectivo contra entrega. Envío por transferencia exige transportista admitido por el esquema existente, costo explícito y cobertura exacta del destino. Sin configuración válida falla sin crear pedido ni reservar stock. Se elimina el transportista predeterminado de la UI; solicita el acordado con el local. No se crean coberturas/tarifas ni se contrata transporte por APIs.
6. Carrito/checkout muestran lista como referencia y explican el 25%; no calculan un total descontado en el navegador. El total final solo aparece desde el pedido persistido. Consulta de carrito por WhatsApp no envía importes como compromiso; mantiene productos/cantidades/método. No se envió ninguna comunicación externa.
7. Solo transferencia y efectivo, acreditación manual administrativa, estados confirmed/paid separados, MP oculto/endpoints 410. SEC-01, autorización, identidad del administrador desde sesión y permisos SQL service-only intactos.

## Archivos de este incremento

- `supabase/migrations/202610110004_pay01_approved_commercial_rules.sql` (nuevo).
- `services/checkout-server.ts`: error de configuración de política reconocido y seguro.
- `app/carrito/page.tsx`, `app/checkout/page.tsx`: referencia de lista, regla aprobada, transportista sin selección por defecto y sin cálculo cliente de descuento.
- `tests/pay01-atomic-checkout.test.mjs`, `tests/pay01-checkout-boundary.test.mjs`: adaptación de expectativas a la regla explícitamente aprobada y siete casos nuevos.
- `docs/BUSINESS_RULES.md`, `docs/CHECKOUT_PAY01.md`, `docs/DEVELOPMENT_BACKLOG.md`, este informe.

Este listado se comparó con el snapshot previo. El diff respecto de HEAD incluye además PAY-01/SEC-01 anteriores; no atribuir todos esos cambios a este incremento. Las migrations `202610110001`, `202610110002` y `202610110003` se preservan sin modificación.

## Pruebas y validaciones

| Comando | Resultado |
| --- | --- |
| `node --test tests/pay01-atomic-checkout.test.mjs tests/pay01-checkout-boundary.test.mjs` | **62/62**, cero fallos/omisiones |
| `node --test tests/*.test.mjs` | **721/721**, cero fallos/omisiones |
| `npm run build` | Correcto con dependencias locales del worktree |
| `npx tsc --noEmit` después del build | Correcto |
| `npm run lint` | **0 errores, 10 advertencias**; sin reglas desactivadas |
| ESLint focalizado de los archivos TS/TSX/tests modificados | Correcto |
| `git diff --check` y comparación del snapshot original | Correctos |

Nuevos casos: descuento único para ambos métodos con distintas variantes de precios diferenciados y múltiples productos, duración de 24 horas/replay sin renovación, rechazo de política/plazo anterior sin efectos, precio congelado tras cambio de catálogo y acreditación, pedidos paid protegidos después del vencimiento incluso con inconsistencia sintética, ausencia de costo/cobertura/transportista válidos y UI sin transporte predeterminado. Continúan concurrentes, rollback, idempotencia, autorización SEC-01, pago manual y MP inaccesible.

PostgreSQL 18.4 efímero en loopback y fixtures sintéticos; migrations aplicadas **solo allí**. Variables locales: `SFSTORE_TEST_PG_BIN=/tmp/sfstore-pg-runtime/node_modules/@embedded-postgres/linux-x64/native/bin`, `SFSTORE_TEST_PG_MODULE=/workspace/sfstore-pay01-rules/node_modules/pg/lib/index.js`, `SFSTORE_TEST_PLAYWRIGHT_MODULE=/tmp/sfstore-p1-playwright.cjs`. Sin credenciales productivas, operaciones de cobro o llamadas Storage.

Evidencia temporal: `/tmp/sfstore-pay01-rules-specific.log`, `/tmp/sfstore-pay01-rules-full.log`, `/tmp/sfstore-pay01-rules-build-final.log`, `/tmp/sfstore-pay01-rules-tsc.log`, `/tmp/sfstore-pay01-rules-lint.log`, `/tmp/sfstore-pay01-rules-focused-lint.log`. No se versionan los logs. El primer build rechazó el symlink a node_modules fuera del root de Turbopack; se copió el árbol de dependencias al nuevo worktree y se repitió sin cambiar configuración. Los primeros tests detectaron una expectativa incorrecta del redondeo, una fixture de transportista fuera de la constraint existente y una ruta de lectura del test; se corrigieron conservando esa constraint y se repitieron satisfactoriamente. No se ocultaron fallos ni se desactivaron pruebas.

Revisión React: se conservaron límites servidor/cliente, labels, protección de doble envío e idempotencia persistente; el formulario no autoriza pagos ni envía importes confiables. Las pruebas de render TS/React y PostgreSQL no certifican el deployment, acceso del comprador real ni acreditación bancaria.

## Migration y configuración pendientes

Nueva migration `202610110004_pay01_approved_commercial_rules.sql`: amplía la constraint de price_policy conservando current_catalog histórico y reemplaza tres funciones existentes (creación, lifecycle, expiración) con ACL service-only explícitas. No inserta/activa configuración, no cambia filas históricas, no modifica roles/credenciales ni agrega cron. No es únicamente aditiva: requiere revisión de funciones, esquema y locks antes de aplicación autorizada.

Orden candidato, pendiente de revisión: prerequisites Storage `202610100001`/`202610100002`, SEC-01 `202610110001`, checkout `202610110002`, pagos manuales `202610110003`, reglas aprobadas `202610110004`. Ninguna se ejecutó en Production. SQL y callers deben integrarse conjuntamente; SEC-01 sola bloquea el checkout anterior.

Configuración futura explícita, **no creada ni habilitada**:

- `reservation_seconds=86400` y `price_policy='manual_25_frozen'`, ya aprobados.
- `approved_revision` y aprobación separada de activación/rollout.
- Condiciones/costo de retiro; no se presume gratis.
- Para envío: transportista de los admitidos por esquema, tarifa y `allowedDestinations` válidos. Sin esos datos no se contrata ni crea un pedido con envío.
- Acceso del comprador: el adaptador disponible exige getUser; confirmar mecanismo de autenticación antes de abrirlo o encargar contrato invitado. No se amplían permisos públicos para suplirlo.

Pendientes operativos: frecuencia de liberación **manual**, posibles prórrogas, pagos tardíos, pagos parciales, total cero y devoluciones. No bloquean la validación de lo implementado, pero deben resolverse antes de ofrecer conductas relacionadas. No requieren volver a aprobar el plazo, descuento o congelación ya definidos. Mercado Pago sigue diferido; no se implementa PAY-02.

Resultado: preparado para revisión técnica; checkout productivo cerrado. Próximo paso: revisar este incremento, definir la configuración real de entrega/acceso y aprobar por separado integración/aplicación/activación. No se inició otro objetivo.
