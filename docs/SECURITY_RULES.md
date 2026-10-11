# Reglas de seguridad y operación

Estas reglas implementan los límites pedidos por el propietario. Esta auditoría no autoriza ejecutar el backlog.

## Entornos y datos

- Usar fixtures sintéticos y PostgreSQL/Supabase de pruebas independiente. Nunca credenciales productivas, pedidos/pagos reales ni borrados de archivos reales en pruebas.
- Production, migrations remotas, RLS/grants, credenciales, pagos, precio/stock real, borrados, merge y deploy requieren autorización explícita para la acción concreta. Prohibido `supabase db push` en este alcance.
- No ejecutar scripts por su nombre: revisar entradas, destino, permisos y efectos. Un dry-run solo es seguro si el código demuestra ausencia de escrituras y no se conecta con credenciales productivas para tests.
- No imprimir, copiar a reports, commitear ni solicitar secretos para documentación. URL/anon key públicas no equivalen a service_role; esa última y tokens/secrets permanecen únicamente servidor.
- Las lecturas de Production tampoco se consideran realizadas por inspeccionar SQL local. Obtener evidencia autorizada de esquema/políticas y no exportar PII innecesaria.

## Fronteras a conservar

Autenticación administrativa: Supabase `auth.getUser()` más allowlist de `ADMIN_ALLOWED_EMAILS`; configuración vacía deniega. Verificar guards de nuevas páginas y acciones; el layout admin no los aplica globalmente. No confiar en UI para autorizar servicios service_role ni introducir fallback de correo.

RPC críticas restringidas a service_role y tablas nuevas con RLS deben conservar grants mínimos. La seguridad pública de tablas base no queda demostrada por esas migrations: faltan políticas completas versionadas y comprobación del entorno real.

La API Sheets valida Bearer timing-safe, tamaño y filas. Preservar estos límites, no registrar el secreto y revisar autorización de cambios de precios al ampliar el contrato.

## Riesgos observados y alcance

| Riesgo | Evidencia | Tratamiento pendiente |
| --- | --- | --- |
| Confianza y escrituras parciales del checkout | `app/checkout/page.tsx` cliente llama `services/orders.ts`: precios del carrito, inserts anon separados, items con product_id null. | PAY-01: diseño autoritativo/idempotente y validación de permisos, sin reproducir ataques sobre datos reales. |
| Preferencia/webhook MP | Handler de preferencia no muestra ownership, rate limit o clave idempotente; webhook consulta MP pero no muestra validación de firma ni comparación explícita completa de moneda/cuenta/importe esperado; pago/inventario son pasos separados. | PAY-02: revisar contrato oficial y probar solo en sandbox/fixtures. No afirmar que cualquier notificación puede marcar un pago aprobado: existe consulta a MP. |
| Permisos efectivos no comprobados | `schema.sql` no contiene RLS completo para tablas originales; tablas/RPC posteriores sí tienen controles. | SEC-01: preparar verificación de esquema/grants en entorno autorizado, fail-closed sin debilitar checkout/guard. |
| Borrado Storage basado en ruta | Corrección P1 existe en draft PR #1, todavía fuera de main. | STG-01: revisar/integrar por separado; nunca activar worker ni aplicar migrations durante esta preparación. |
| Dependencias | npm audit reporta 36 entradas (1 crítica, 34 altas, 1 moderada), incluida Next.js y xlsx. | DEP-01/DEP-02: comprobar alcance y rutas reales; count incluye propagación transitive, no equivale a 36 exploits demostrados. |
| Logs de login | `app/admin/login/actions.ts` contiene TEMP DEBUG con email enviado y allowlist; no se observó log de contraseña. | SEC-02: minimizar PII/verbosity sin eliminar diagnóstico útil. |
| Disponibilidad del catálogo | Servicios retornan respaldo incluso en error o listado vacío. | CAT-01: decidir comportamiento explícito y observable. |

No hubo explotación, scan dinámico del sitio real ni prueba de secretos de Production. Hallazgos por fuente/dependencias se distinguen de vulnerabilidades confirmadas en un deployment.

## Flujo de cambios sensibles

Preparar requisitos, diff y pruebas locales revisables dentro del alcance autorizado; obtener aprobación explícita antes de ejecutar una tarea RESTRINGIDA. La aprobación de una migration no aprueba activar el procesador, limpiar Storage o desplegar. Mantener separados esos efectos y registrar autorización/evidencia sin secretos. No integrar tareas supervisadas sin revisión.

## Actualización local de Fase 2

SEC-02 elimina logs de correo/allowlist y mensajes libres de Auth en la rama de mantenimiento, sin modificar checks de acceso, credenciales enviadas, redirects ni signOut. Conserva eventos estáticos, códigos de error conocidos y status numérico. Siete pruebas sintéticas comprueban flujos y ausencia de datos personales/secrets en logs. Este cambio no está integrado/desplegado; el riesgo descrito en la tabla corresponde al baseline de main. Dependencias analizadas en [triage](../reports/dependency-triage-phase2-20261010.md), sin actualizaciones ni exposición productiva probada.

## SEC-01 — Candidato local autorizado

El pedido posterior autoriza correcciones SEC-01 en rama aislada y migrations únicamente en DB de pruebas. [Matriz](SUPABASE_PERMISSIONS_SEC01.md) y [evidencia](../reports/sec01-execution-20261010.md): RLS/ACL explícitas, columnas públicas mínimas, RPC service-only y guard de lookup privado. Esto no verifica Production ni autoriza aplicación/publicación. La migration candidata deniega inserts públicos de checkout: necesita PAY-01 antes de cualquier rollout. APIs que usan service_role requieren controles propios; pagos/ownership siguen en PAY-01/PAY-02. No crear policies públicas para eludir este bloqueo.

## PAY-01 — Candidato local con configuración cerrada

En `codex/pay-01-atomic-checkout` se sustituyen inserts públicos por un contrato servidor autorizado, transacción service-only y recibo propio. [Contrato y matriz complementaria](CHECKOUT_PAY01.md). La configuración nace vacía, sin activación ni política comercial por defecto; no habilitar reservas/cobros con este desarrollo local. Las mutaciones y EXECUTE públicos permanecen denegados según SEC-01. La adaptación manual deshabilita globalmente los endpoints de Mercado Pago (410 incondicional, sin SDK ni llamadas); PAY-02 queda diferida por decisión comercial. Acreditación manual y liberación explícita de reservas requieren getUser + allowlist administrativa antes de construir el cliente privilegiado; sus RPC son service-only, el comprador no puede acreditar pagos y confirmed no equivale a paid. Recibos y libro del nuevo checkout tienen guards transaccionales; no se modifican pedidos históricos. No se ejecutaron migrations remotas ni se modificaron secretos.

## PAY-01 invitado y cotizaciones nacionales (candidato local)

Supabase Auth anónimo verificado no equivale al rol SQL anon: usa authenticated, sin nuevas escrituras directas ni EXECUTE públicos. Usuarios is_anonymous son rechazados como administradores aunque tengan email allowlisted. Recibos/cotizaciones filtran por UUID de sesión verificado antes de crear cliente privilegiado; no se autoriza con IDs del body.

checkout_shipping_quote_requests: RLS activo, anon/authenticated sin privilegios; service_role SELECT/INSERT/UPDATE explícitos, sin DELETE. get_checkout_shipping_quote y request_checkout_shipping_quote: EXECUTE solo service_role, SECURITY INVOKER y search_path fijo. La cotización no modifica pedidos/stock. Sin tokens o datos personales en respuestas de bootstrap/metadata de idempotencia. Configurar y probar CAPTCHA real en Supabase antes de habilitar Anonymous Sign-ins; flag invitado cerrado por defecto.
