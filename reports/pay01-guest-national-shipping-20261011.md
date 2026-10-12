# PAY-01 — Compra invitada y envíos nacionales

Candidato local en `codex/pay01-guest-national-shipping`, worktree `/workspace/sfstore-guest-shipping`. Base integrada `69049e2` más copia íntegra de SEC-01/PAY-01 del worktree de preparación. Los hashes de los 58 archivos del manifiesto de origen siguen iguales: no se alteraron ramas/worktrees anteriores. Sin commit, push, merge, despliegue, configuración remota, migraciones productivas, datos reales ni procesos recurrentes.

## Implementación verificable

- Invitado sin contraseña: bootstrap server-side de Supabase Anonymous Auth, getUser verificado, cookie separada HttpOnly/Secure/SameSite y renovación en proxy antes de recibos. Reutiliza sesiones existentes; pérdida de sesión con operación pendiente bloquea reemplazo silencioso. Web Locks serializa pestañas; navegador incompatible falla con mensaje.
- Identidad nunca viene del body. Recibos y cotizaciones solo se leen con identidad propietaria; anon SQL no obtiene escrituras ni RPC. Invitados is_anonymous nunca son administradores. Nombre y teléfono obligatorios, email opcional. Metadata de operación contiene SHA-256 y UUID, sin datos personales; claves antiguas se conservan al actualizar formato.
- Provincias argentinas oficiales, localidad, código postal y dirección. Tarifas configurables por destino, centavos, vigencia y revisión; sin tarifa predeterminada ni transportista asignado. El cliente selecciona un quoteKey emitido por servidor; la RPC vuelve a validar y congela tarifa. Cambio de configuración invalida la clave para pedidos nuevos.
- Falta de tarifa: cotización idempotente privada, sin pedido, reserva ni importe supuesto. Administradores autorizados ven contacto/destino/productos. No se implementa contratación, conversión automática ni resolución económica arbitraria.
- Descuento único 25% sobre precio de lista, stock atómico, reserva 86400 segundos, pagos manuales y expiración explícita existentes conservados. Sin descuento sobre envío; efectivo sigue siendo al retirar. Mercado Pago continúa bloqueado.

## Archivos de este alcance

UI: app/checkout/page.tsx, app/admin/checkout/page.tsx, components/checkout-captcha.tsx.
Auth: lib/supabase/auth-server.ts, lib/admin-session.ts, lib/checkout/guest-client.ts, services/checkout-guest-session.ts, proxy.ts, app/api/checkout/session/route.ts.
Envíos: lib/checkout/argentina.ts, lib/checkout/shipping-http.ts, services/checkout-shipping.ts, app/api/checkout/shipping/route.ts, app/api/checkout/quotation/route.ts.
Contrato/integración: lib/checkout/contract.ts, lib/checkout/http.ts, services/orders.ts, services/checkout-server.ts, services/checkout-manual-admin.ts.
Migration: supabase/migrations/202610110006_pay01_guest_national_shipping.sql.
Pruebas: tests/pay01-atomic-checkout.test.mjs, tests/pay01-checkout-boundary.test.mjs, tests/pay01-guest-shipping-boundary.test.mjs, tests/pay01-guest-shipping-browser.test.mjs, tests/sec01-pay01-integration.test.mjs.
Documentación/config: docs/BUSINESS_RULES.md, docs/CHECKOUT_PAY01.md, docs/SECURITY_RULES.md, docs/SUPABASE_PERMISSIONS_SEC01.md, docs/DEVELOPMENT_BACKLOG.md, config/checkout-shipping.pending.json, reports/sec01-pay01-integration-migration-manifest.json, este informe y reports/pay01-guest-shipping-read-only.sql.

## Migración y controles pendientes

Aplicar 006 únicamente después de las siete migraciones Storage/SEC/PAY anteriores, según manifest con checksum. Agrega tabla privada con RLS, grants mínimos y dos RPC service-only; reemplaza create_checkout_atomic preservando idempotencia/lifecycle. No carga tarifas, no modifica históricos, no habilita checkout/Auth, no limpia Storage. El historial conserva colisión preexistente de versión 202609180002: resolver el registro real antes de cualquier aplicación autorizada, sin usar db push.

Verificación read-only adjunta: una tabla con RLS=true; anon/authenticated SELECT/INSERT/DELETE=false; service SELECT/INSERT=true y DELETE=false; dos funciones SECURITY INVOKER con search_path fijo, anon/authenticated EXECUTE=false, service=true. No acredita configuración efectiva de Auth/CAPTCHA ni permisos reales de Production desde tests locales.

Antes de habilitar: revisar migraciones y esquema real sin escrituras, validar en staging; habilitar Anonymous Sign-ins y **CAPTCHA Turnstile en Supabase**, configurar dominio/site key público NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY y solo después CHECKOUT_GUEST_ENABLED=true. El servidor exige token en modo Production; la validación CAPTCHA depende del proveedor efectivamente configurado, no del simple token presente. Secrets se configuran en Supabase, no en el código. HTTPS y navegador con Web Locks necesarios. Checkout y envío de plantilla siguen disabled, sin tarifas/carriers.

Propietario debe proveer costos, carrier real compatible y revisión aprobada; decidir condiciones/costo de retiro. Tarifas admiten provincia y opcionalmente localidad/código postal; una fila provincial cubre explícitamente esa provincia, no supone tarifa nacional. Varias coincidencias se ofrecen, no se inventa precedencia. Cero solo es válido cuando se configure expresamente. Otros carriers requieren revisión del constraint existente.

Perder cookie no autoriza recuperación por email/UUID: asistencia administrativa; recuperación OTP no implementada. Retención de datos, límites operativos/antifraude y limpieza de cuentas invitadas requieren revisión antes de lanzamiento. No se añadieron comunicaciones externas, cron ni funciones comerciales ajenas.

## Validación

Validación final: **749/749 pruebas aprobadas, 0 fallos, 0 omisiones**. TypeScript y build correctos; ESLint global 0 errores y 10 advertencias conservadas. PostgreSQL efímero, fixtures sintéticos, APIs de Auth/Storage mock, Chromium local bloqueando destinos externos. No llamadas productivas ni borrados reales. El flujo navegador usa APIs sintéticas y no reemplaza una prueba de Auth/CAPTCHA real en staging.

Durante las validaciones se ajustó un fixture antiguo para incluir destino argentino válido y seguir probando ausencia de tarifa. Chromium detectó nombres accesibles ambiguos en selectores de provincia/tarifa; se agregaron etiquetas explícitas. No se desactivaron pruebas ni se cambiaron permisos para hacerlas pasar.

Comandos finales (todos exit 0):

- `node --test tests/pay01-guest-shipping-browser.test.mjs`: 1/1 Chromium, con SFSTORE_TEST_CHECKOUT_URL loopback y wrapper Playwright local.
- `node --test tests/*.test.mjs`: 749/749, incluyendo PostgreSQL local con SFSTORE_TEST_PG_BIN/SFSTORE_TEST_PG_MODULE y navegador sintético.
- `npm run build`, seguido de `npx tsc --noEmit`.
- `npm run lint`: 0 errores/10 advertencias.
- `git diff --check`: correcto. Checksums de las ocho migraciones coinciden con manifest.

La suite cubre permisos permitidos/denegados, sesión inválida/perdida, CAPTCHA ausente, errores de cookies/Auth, aislamiento de comprador, tarifas por destino inválidas/vencidas y claves obsoletas, cotizaciones repetidas sin modificar stock, concurrencia/idempotencia de pedidos y acreditación, descuento único, expiración de reservas/pagos protegidos y Mercado Pago inaccesible. La verificación SQL read-only adjunta se ejecutó dentro de la prueba PostgreSQL de permisos y produjo los resultados esperados.

Listo para **revisión técnica**, no habilitación productiva. Próximo paso: revisar migration 006 junto al conjunto pendiente, configurar Auth/CAPTCHA y tarifas en staging y probar el proveedor real. No se continúa otro objetivo.
