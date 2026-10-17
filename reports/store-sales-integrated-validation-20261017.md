# Ventas físicas — Fase 1B: aceptación integrada local

Fecha: 2026-10-17. Rama `codex/store-sales-full-payment-20261017`.
Resultado final: **12 pruebas aprobadas, 0 fallos, 0 omisiones**. No se modificó código funcional de la Fase 1.

## Entorno y alcance real

- Supabase local existente: proyecto `sfstore-checkout-synthetic-staging`, API `http://127.0.0.1:54331`, PostgreSQL en loopback:54332. Se verificaron labels Docker y la identidad `SFSTORE_SYNTHETIC_STAGING` antes de escribir.
- Auth, gateway Kong, PostgREST y PostgreSQL reales. La instancia local usa PostgreSQL 15.19; la Fase 1 ya había aprobado 30 casos en PostgreSQL 17.6 descartable. Este ensayo no afirma usar Supabase gestionado 17.6.
- Next.js de esta rama, proceso temporal en `127.0.0.1:3148`, variables locales en memoria, sin archivos .env. Servidor detenido al terminar.
- Edge headless con perfiles separados; no se controló el navegador habitual ni el mouse. No hubo mocks de Server Actions, servicios Supabase, PostgREST, RPC o inventario.
- Se aplicó **sólo en la base sintética local** `202610170001_store_sales_full_payment.sql`. No se reinicializó Supabase ni se reemplazaron registros previos. Recarga de caché PostgREST mediante NOTIFY local.
- Auth local emitió enlaces de acceso para usuarios sintéticos con dominio staging.invalid; se verificó el OTP y getUser real, generando cookies SSR. La allowlist de un único administrador sintético existió sólo en el proceso temporal de Next.
- CAPTCHA permaneció habilitado y no se modificó su configuración. Este ensayo no repite el login por contraseña ni certifica Turnstile: la creación de sesiones fue mediante el mecanismo Auth de enlace de acceso, no una excepción en la aplicación.
- Claves de gateway y acceso PostgreSQL local leídos en memoria desde los contenedores autorizados. No se usaron claves productivas ni se guardaron tokens, cookies o contraseñas en evidencia.

## Resultados por requisito

| Requisito | Resultado y evidencia |
| --- | --- |
| 1. Efectivo | PASS: UI real crea venta de 2 unidades de lista 100; subtotal 200, descuento 50, total cobrado 150. |
| 2. Transferencia | PASS: mismo subtotal/descuento/total y cobro completo. |
| 3. Efectivo + transferencia | PASS: pagos 50 + 100, total 150. |
| 4. Efectivo + débito | PASS: pagos 50 + 150, total 200, descuento 0 para toda la venta. |
| 5. Crédito, QR y otro | PASS: tres ventas independientes a lista, total 200; detalle original del medio persistido. |
| 6. Importes inválidos | PASS: 149.99 y 150.01 bloqueados en UI. Un envío forzado del formulario real también fue rechazado por Server Action/PostgREST/RPC; sin pedido, pago, movimiento ni cambio de stock. |
| 7. Snapshots | PASS en las siete ventas: subtotal de lista, descuento, total, lista unitaria 100 y costo unitario 40 persistidos; consulta del detalle real. Editar luego precio/costo del producto sintético no cambia el snapshot. |
| 8. Stock una vez | PASS: stock 2 -> 0 y exactamente un movimiento de venta por operación, no por cada medio de pago. |
| 9. Reintento | PASS: replay del POST de la Server Action de efectivo, autenticado y con la misma clave; mismo pedido y ningún pago o movimiento adicional, aun tras cambiar precio/costo del producto sintético. |
| 10. Reserva online activa | PASS: comprador con sesión real crea reserva desde /api/checkout; 24h, total 150, stock 0. El formulario de mostrador cargado antes de la reserva es rechazado por stock insuficiente. |
| 11. Formato anterior | PASS: venta sintética con contrato anterior, precio 80, pagada y sin snapshots, permanece consultable en su ruta; no cambian importes, estado o metadata. En la primera ejecución se creó antes de aplicar el DDL local. No se consultaron ventas reales del Excel ni Production. |
| 12. Compatibilidad online | PASS: creación y reintento por endpoint real, mismo pedido y reserva, 25% único, snapshots nuevos NULL para web; sin consumo adicional de stock. |

Control de autorización adicional: sin sesión y usuario autenticado fuera de allowlist son redirigidos a login; el rol anon no puede ejecutar la RPC de mostrador.

## Problemas encontrados y correcciones

Primera ejecución: 10 PASS, 2 FAIL del arnés, sin defecto comercial demostrado:

1. La comprobación de acceso inspeccionaba la URL antes de que terminara la redirección SSR. Se cambió a esperar explícitamente la URL de login; no se alteró la autorización.
2. La solicitud online de prueba no enviaba Origin y recibió 403, tal como exige la aplicación. Se agregó el Origin local correcto; no se alteró la guarda ni el endpoint.

Reejecución final: 12/12 PASS. Se preservó la evidencia de la primera ejecución y se separaron los resultados posteriores por run_id.

## Evidencia y reproducción

Arnés versionable: `tests/store-sales-real-local.test.mjs`. Requiere opt-in `SFSTORE_REAL_LOCAL_STORE_SALES=true`, ruta al ejecutable Docker en `SFSTORE_TEST_DOCKER`, Playwright en `SFSTORE_TEST_PLAYWRIGHT_MODULE` y Supabase sintético existente. Si faltan columnas, requiere además `SFSTORE_STORE_SALES_APPLY_LOCAL_MIGRATION=true`. Ejecutar con `node --test --test-reporter=spec tests/store-sales-real-local.test.mjs`.
El arnés rehúsa archivos .env locales en el worktree, destinos remotos, identidad no sintética, Auth sin CAPTCHA, configuración web incompatible y esquema parcialmente actualizado. No imprime credenciales.

Evidencia de detalle en `staging/runtime/store-sales-1b/` (ignorada por Git). Sólo estados y referencias a fixtures sintéticos, sin credenciales. Los productos creados quedan draft al finalizar; pedidos, movimientos y usuarios sintéticos se conservan para trazabilidad. Existe una reserva online sintética pendiente en esta instancia local; no se ejecutó una liberación global que pudiera afectar otros ensayos.

Lint del arnés: aprobado. git diff --check: aprobado. Gitleaks 8.30.1 con salida redactada sobre el arnés y documentación de esta fase: sin hallazgos. Lectura final: 11 productos de la última ejecución, 0 activos/visibles y 0 con stock negativo. No quedó el servidor temporal escuchando en 3148. No se repitieron build ni la suite general de Fase 1 porque no hubo cambios en aplicación, dependencias o SQL candidato.

## Recomendación

**Lista para revisión e integración autorizada** en cuanto al circuito comercial de Fase 1. Este resultado no ejecuta ni autoriza integración/despliegue.

Pendientes de publicación: revisión humana del diff, autorización independiente de SQL productivo y publicación coordinada de código/esquema. Las columnas deben existir antes del nuevo código; recargar formularios viejos. Los costos ausentes siguen siendo desconocidos (NULL), y no se reconstruyen costos históricos.

El ensayo valida ventas de formato anterior con datos sintéticos; no certifica calidad o completitud del historial real importado del Excel. La ruta completa se validó en Supabase local PG15.19, complementada por el ensayo previo PG17.6. No se amplió a estadísticas, nuevos módulos ni automatización de reservas.
