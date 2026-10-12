# SEC-01/PAY-01 — preparación de pruebas completas en staging

Rama `codex/sec01-pay01-staging-preparation`, worktree `/workspace/sfstore-staging-preparation`, baseline `69049e2` más copia íntegra del checkout invitado y SEC/PAY existentes. Sin commit/push/merge/deploy ni migraciones remotas. No se usan Production, secretos productivos, backups, datos reales ni archivos Storage reales.

## Migraciones y compatibilidad

Las ocho pendientes se conservan byte a byte y se aplican en este orden después del historial base:

1. 202610100001_product_storage_task_results: columna nullable result jsonb.
2. 202610100002_durable_admin_image_delete: cola/metadata administrativa; ningún borrado Storage.
3. 202610110001_sec01_effective_permissions: RLS/grants privados y catálogo mínimo público; invalida el checkout legacy público.
4. 202610110002_pay01_atomic_checkout: requiere SEC, tablas/RPC atómicas e idempotencia; ninguna configuración habilitada.
5. 202610110003_pay01_manual_payments: acreditación manual/lifecycle protegido; MP no se activa.
6. 202610110004_pay01_approved_commercial_rules: descuento único 25% sobre lista, precio congelado, reserva 24h, entrega explícita.
7. 202610110005_pay01_inventory_transition_permissions: UPDATE limitado a movement_type/reason para service_role, necesario para convertir reservas al acreditar.
8. 202610110006_pay01_guest_national_shipping: cotizaciones privadas/RPC service-only y create_checkout_atomic compatible; valida tarifas por destino argentino; no habilita Auth ni envíos reales.

Compatibilidad validada ejecutando el conjunto completo en PostgreSQL efímero, sin grants service indiscriminados. Se mantienen las pruebas de compatibilidad con registros históricos sintéticos de fases anteriores. SQL con reemplazos de funciones/políticas y nuevas tablas **no es todo aditivo ni reejecutable**; aplicar una sola vez desde historial correcto. Las transacciones son por archivo, no globales sobre todo el conjunto.

## Colisión 202609180002

Resuelta **para el nuevo entorno aislado** mediante historial alternativo reproducible: schema.sql → baseline de staging 202609100001; store_sales_checkout conserva 202609180002; suppliers_admin → alias staging 202609180003, contenido idéntico. No se cambiaron/renombraron migrations originales ni registros aplicados. Todos los 23 pasos tienen versión única, fuente y SHA-256 en `staging/migration-manifest.json`; el generador no ejecuta SQL, no tolera copias modificadas ni SQL inesperado.

El historial canónico sigue conservando la colisión histórica por diseño, para no reescribir archivos aplicados. Un proyecto existente requiere ledger real (name/statements/version) y comparación de objetos/checksums antes de cualquier repair autorizado. Objetos efectivos pueden proceder de overrides posteriores: no prueban cuál 002 quedó registrado. `reports/staging-migration-history-read-only.sql` prepara esa inspección; no se ejecutó contra ningún entorno remoto. Esta entrega no propone un repair ciego de Production.

## Entorno y configuración

`staging/supabase/config.toml` define proyecto local y puertos separados, sin link/reference remoto. Archivo parseado como TOML; configuración **todavía no validada por un stack Supabase iniciado**. Anonymous Sign-ins y CAPTCHA Turnstile habilitados; secret solo env(SUPABASE_AUTH_CAPTCHA_SECRET), site key de staging en app. Secret no incluido. La autenticación invitada no concede RLS/EXECUTE públicos y los administradores requieren usuario no anónimo en allowlist.

`staging/supabase/seed.sql` tiene solo producto, retiro y tarifa sintéticos. Marcador de staging y tablas vacías obligatorios; prueba confirma que no sobrescribe datos existentes. Los valores de prueba no son tarifas/stock aprobados para negocio. Config comercial pendiente del repositorio sigue deshabilitada. No se importó seed histórico, Storage files ni cuentas reales; usuario administrador de prueba se crea manualmente en Auth local.

[Procedimiento completo y aceptación manual](../staging/README.md) describe inicio/paro local, claves del mismo stack, perfiles A/B/admin, prueba CAPTCHA real, recibos, pago y expiración simulada en registros sintéticos. Staging remoto y despliegues requerirían autorización separada; aquí no se crean ni ejecutan.

## Pruebas incorporadas

`tests/pay01-staging-functional.test.mjs`: integridad del historial sin tocar fuentes; aplicación real de las 23 copias SQL y seed; compra con precio congelado/descuento único; reserva de 24h; acreditación manual idempotente y protección del pedido pagado; efectivo vencido libera una sola vez; reserva bloqueada se difiere y la siguiente ejecución manual la libera; envío con costo conocido y cotización sin total/reserva; compras concurrentes; rechazo de roles públicos; seed rechaza tablas no vacías. Identidades UUID sintéticas representan ownership; no son cuentas Auth reales.

`tests/pay01-guest-shipping-browser.test.mjs`: añade GET/POST reales contra ambos endpoints MP del servidor local, exige 410/AUTOMATIC_PAYMENTS_DISABLED. El resto del flujo Chromium sigue usando APIs de checkout/Auth sintéticas. Suite existente verifica también el guard administrativo y acceso privado de cada comprador.

## Bloqueos concretos para certificar staging completo

1. CLI local no operativo aquí: no estaba instalado; 2.120.0 inicialización falló al crear `/home/agent/.supabase` en filesystem read-only. Segunda alternativa 2.75.0 terminó en postinstall exit 1 sin diagnóstico adicional útil. Se detuvieron los intentos. Docker responde (28.4.0), sin imágenes Supabase disponibles; no se iniciaron contenedores. Acción: instalar CLI en un entorno local con directorio de usuario escribible, verificar `supabase --version` y compatibilidad del TOML, luego seguir `staging/README.md`. No implica permiso para migraciones remotas.
2. Faltan widget, site key y secret CAPTCHA de staging. Acción: propietario configura Turnstile para dominios de prueba, pasa secret exclusivamente al proceso Supabase y site key al runtime de app. Verificar token válido/inválido/expirado con Auth real; no desactivar CAPTCHA para obtener verde. No solicitamos credenciales productivas.
3. No se inspeccionó ledger/esquema de un proyecto existente. Acción: si se pretende reutilizarlo, ejecutar inspecciones read-only autorizadas y aportar evidencia para un mapping revisado. El paquete entregado solo admite base local nueva/vacía.

La preparación y los flows de DB son verificables; **no se declara certificada la integración GoTrue/PostgREST/Turnstile** hasta ejecutar las pruebas manuales en el stack real. No se habilitó Production ni una tarea recurrente. La provisión de tarifas/carriers reales continúa siendo configuración comercial pendiente, ajena a los fixtures de staging.

## Archivos de este lote

Nuevo: scripts/prepare-checkout-staging.mjs, staging/README.md, staging/app.env.example, staging/migration-manifest.json, staging/supabase/config.toml, staging/supabase/seed.sql, tests/pay01-staging-functional.test.mjs, reports/staging-migration-history-read-only.sql y este informe.
Modificado: .gitignore, tests/pay01-guest-shipping-browser.test.mjs, tests/pay01-atomic-checkout.test.mjs, docs/CHECKOUT_PAY01.md y docs/DEVELOPMENT_BACKLOG.md. Las copias staging/supabase/migrations son generadas e ignoradas; las migrations canónicas no cambian. El trabajo previo permanece sin commit y se preserva.

## Incidencia de concurrencia encontrada

Primera suite amplia: 755/757 correctas, dos fallos vinculados a un fixture preexistente. Al competir un pago ya vencido con expire_checkout_reservations, SKIP LOCKED puede omitir la fila mientras la acreditación tiene el lock; la acreditación luego falla y hace rollback. El test asumía liberación inmediata y dejaba esa fila pendiente, contaminando el siguiente conteo. Se corrigió el test para comprobar suma de liberaciones de primera llamada y siguiente ejecución manual = 1, cero pagos, stock restituido y un solo movimiento release. No se cambiaron RPC, migraciones ni reglas comerciales. Nuevo caso determinista retiene el lock, comprueba que no libera mientras está retenido y libera exactamente una vez al soltarlo. Pruebas focalizadas finales: 57/57, sin skips. El procedimiento manual aclara que una fila bloqueada requiere otra ejecución autorizada, sin cron.

## Resultados finales

- `node scripts/prepare-checkout-staging.mjs`: 23 versiones locales únicas; regeneración reproducible, sin ejecutar SQL.
- PostgreSQL focalizado `node --test tests/pay01-atomic-checkout.test.mjs tests/pay01-staging-functional.test.mjs`: 57/57.
- Chromium `node --test tests/pay01-guest-shipping-browser.test.mjs`: 1/1, incluidos GET/POST reales contra dos endpoints MP cerrados.
- Suite `node --test tests/*.test.mjs`: **758/758**, cero fallos/cancelaciones/omisiones; PostgreSQL efímero y Chromium habilitados mediante SFSTORE_TEST_PG_BIN, SFSTORE_TEST_PG_MODULE, SFSTORE_TEST_PLAYWRIGHT_MODULE y URL loopback 3107.
- `npm run build`, luego `npx tsc --noEmit`: correctos.
- `npm run lint`: 0 errores y 10 advertencias conservadas. ESLint focalizado final sobre scripts/pruebas modificados: sin errores ni advertencias.
- TOML parseado con tomllib; flags Auth/CAPTCHA, puertos y referencia env del secret comprobados; no equivale a validación del CLI.
- `git diff --check`: correcto. Las ocho migrations pendientes conservan checksums y los **361 archivos del manifiesto del worktree original** conservan hashes.

El lote está preparado para revisión y ejecución manual de staging local. Requiere resolver CLI y claves CAPTCHA antes de certificar el stack real. No se crean commits ni se publica; no se inicia otro objetivo.

## Actualización posterior de puesta en marcha

CLI instalado mediante binario oficial/checksum; claves Turnstile de prueba autorizadas y preparadas localmente. El stack ahora está bloqueado por red hacia registry/CAPTCHA, no por la instalación. Ver [estado real y pruebas de este intento](sec01-pay01-local-runtime-20261011.md); todavía no se certifica integración de servicios reales.
