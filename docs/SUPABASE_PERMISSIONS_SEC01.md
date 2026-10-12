# SEC-01 — Matriz de permisos y frontera de confianza

Referencia: baseline integrado `69049e2` / integración `531d411`; implementación local en `codex/sec-01-supabase-permissions`. Esta matriz describe el candidato probado, no el estado efectivo de Production. No se consultó Production ni se usaron sus credenciales.

## Arquitectura y operaciones comprobadas

- `services/products.ts` consulta con la clave pública y proyecciones explícitas de productos, categorías, imágenes y atributos. Visibilidad vigente: activo, no histórico, categoría activa/no vacía, exclusión de identidad Yara supersedida. El candidato lleva esa frontera a SQL sin cambiar precios/stock ni reglas de visibilidad.
- `services/orders.ts` crea cliente/pedido/items desde el navegador con rol público, en tres inserts separados. No hay contrato de propiedad del comprador ni precio/stock autoritativos. La matriz segura deniega esos inserts; **no aplicar la migration con ese checkout todavía activo**. PAY-01 debe sustituirlo, con reglas comerciales aprobadas.
- Páginas admin usan `requireAdminSession`; acciones usan `requireAdminActionSession`. Autorización existente: `auth.getUser()` y `ADMIN_ALLOWED_EMAILS`; vacío o error deniega. Los servicios admin utilizan `service_role`; un usuario allowlisted sigue siendo `authenticated` al llamar directamente a Supabase y no recibe privilegios SQL especiales.
- Compras/ventas/pedidos/inventario usan RPC `security invoker` restringidas a `service_role`. Guardado de producto y metadata de galería emplean las RPC integradas, sin modificar sus cuerpos o activar limpieza.
- Storage: uploads de `services/product-save.ts` usan cliente servidor y bucket `product-images`; el frontend usa URLs públicas guardadas en metadata. No necesita permiso SQL para listar/escribir objetos.
- El lookup de `/checkout/exito` antes leía órdenes por UUID con `service_role` sin autorización. Ahora está aislado en `services/checkout-order-read.ts`, `server-only`, y exige el guard admin existente antes de crear el cliente privilegiado. UUID no es prueba de ownership. El cliente privilegiado también queda marcado `server-only`; la creación pública se conserva separada para PAY-01.
- APIs Mercado Pago utilizan `service_role`, no RLS del solicitante. Ownership de preferencia y autorización/firma/conciliación de webhook siguen en PAY-01/PAY-02: **RLS no sustituye sus controles HTTP**. Sheets conserva Bearer timing-safe, límite 256 KiB y 30 filas; no se cambian permisos o secretos de integración.

## Matriz candidata

`anon` y `authenticated` tienen la misma frontera SQL. No se crea un rol comercial de compradores/admin ni se infieren permisos de un email JWT. `service_role` es un rol técnico privilegiado, no una identidad de usuario final; conserva BYPASSRLS y requiere autorización del endpoint que lo utiliza.

| Recurso / operación | anon | authenticated (incluido admin directo) | service_role / servidor autorizado |
| --- | --- | --- | --- |
| `categories`: SELECT de id/name/slug/is_active | Solo activas y slug no vacío | Igual | Lectura/escritura administrativa |
| `products`: SELECT de proyección pública | Solo activos/no históricos/categoría visible/no Yara supersedida | Igual | Lectura completa y operaciones administrativas |
| `products`: cost, SKU, origen de costo, campos históricos internos | Denegado | Denegado | Según grants existentes y acceso admin |
| `product_images`: product_id/url/alt/sort_order/is_primary | Solo padre visible | Igual | Guardado/ordenamiento/eliminación de metadata |
| `product_attributes`: product_id/name/value/sort_order | Solo padre visible | Igual | Gestión administrativa |
| Mutaciones de las cuatro tablas de catálogo | Denegadas | Denegadas | Operaciones existentes |
| `customers`, `orders`, `order_items` | Sin SELECT/INSERT/UPDATE/DELETE/TRUNCATE | Igual | Operaciones existentes de servidor; checkout público nuevo pendiente |
| `settings`, `inventory_movements`, `analytics_events` | Sin acceso | Igual | Settings S/I/U/D, movimientos/eventos S/I concedidos; otros grants anteriores no se amplían/revisten |
| `suppliers`, `purchases`, `purchase_items` | Sin acceso | Igual | Mínimos explícitos S/I/U; items también D para reemplazar borradores; se conservan grants previos |
| `order_payments` | Sin acceso | Igual | Grants existentes, ledger/RPC existentes |
| `historical_import_batches`, `historical_import_records` | Sin acceso | Igual | Grants y triggers de auditoría existentes |
| `product_save_operations`, `product_storage_tasks` | Sin acceso | Igual | S/I/U existentes; DELETE sigue denegado |
| Todas las funciones versionadas de aplicación, incluidas helpers/triggers | EXECUTE denegado | EXECUTE denegado | EXECUTE permitido; cuerpos e idempotencia sin cambios |
| `storage.objects`, bucket `product-images`: listar/subir/actualizar/borrar metadata | Denegado por política restrictiva | Igual | Acceso Storage existente; no se activa ningún worker |
| URL pública de objeto en bucket público | Se conserva | Se conserva | Se conserva |
| Otros buckets | Policies existentes sin cambios | Igual | Sin cambios |
| CREATE en schema `public` | Denegado | Denegado | No se modifican grants existentes del servidor |
| Lectura DB de orden desde página de éxito | Denegada | Solo si pasa guard admin servidor | Lectura mínima posterior al guard; contrato comprador pendiente |

Proyección pública exacta de `products`: `id`, `name`, `slug`, `short_description`, `description`, `price`, `transfer_price`, `stock`, `featured`, `status`, `historical_identity`, `category_id`. Se concede además `product_id` a las relaciones para sus joins, aunque no se muestre en UI.

Los permisos mínimos concedidos a `service_role` no revocan grants administrativos anteriores desconocidos; la matriz distingue mínimos del candidato y permisos existentes. La inspección read-only muestra los efectivos. El rol privilegiado y triggers no equivalen a permisos comerciales para usuarios directos.

## Correcciones y defensa ante drift

Migration candidata: `supabase/migrations/202610110001_sec01_effective_permissions.sql`.

- Una transacción: RLS en las 18 tablas conocidas, revocación de ACL de tabla **y columna** para PUBLIC/anon/authenticated, proyección pública explícita.
- Políticas restrictivas conservan límites frente a policies permisivas antiguas. Denegaciones separadas para INSERT/UPDATE/DELETE del catálogo; tablas privadas deny-all. Se reemplazan únicamente policies con prefijo `sec01_`, no policies ajenas.
- Bucket guard restrictivo únicamente para `product-images`. No cambia `storage.buckets.public`, objetos ni grants/policies de otros buckets. En Supabase, descargas por URL de bucket público evaden SELECT RLS de objetos; siguen disponibles, incluso URLs conocidas de imágenes de productos no visibles. No se promete privacidad de archivos de bucket público.
- EXECUTE revocado de todas las funciones versionadas, incluyendo overloads y helpers que conservaban el default PUBLIC; funciones de extensiones y funciones no versionadas quedan fuera del cambio y aparecen en la inspección para revisión.
- Fail-closed ante rol faltante/superuser/BYPASSRLS público, membership en rol privilegiado, propiedad/membership de tablas, ACL heredadas inesperadas, tabla requerida ausente o Storage sin RLS. Se aborta y revierte toda la migration; no se corrigen memberships/owners/roles automáticamente.
- Lock timeout 5s y statement timeout 30s. No hay DML de negocio, cambio de credenciales, funciones de checkout, imports históricos ni limpieza Storage.

## Verificación del entorno real pendiente

[SQL read-only](../reports/sec01-permissions-read-only.sql) usa `BEGIN READ ONLY`; inspecciona roles/memberships, schemas, relaciones/owners/RLS, policies, permisos de columna, funciones/grants, defaults y bucket público. No consulta filas de clientes, órdenes ni objetos.

Después de aplicar el candidato en el entorno aislado: `violations = 0`, `details = []`; roles públicos sin CREATE/escrituras/PII/EXECUTE crítico, proyección de columnas pública únicamente. El resultado se comprobó con PostgreSQL real. Cero violaciones no valida expresiones ajenas, API HTTP, bucket público, vistas/RPC no versionadas o defaults futuros: revisar también los demás result sets.

No hay evidencia del esquema efectivo de Production. Acción exacta necesaria para comparar: ejecutar ese SQL en un entorno expresamente autorizado y revisar los metadatos resultantes, incluidas vistas/migrations/funciones no versionadas y memberships. No se necesitan valores de secretos ni exportar PII. Toda futura aplicación productiva requiere autorización separada y orden de rollout con PAY-01/Storage.

## Decisiones pendientes

1. PAY-01: precio vigente, envío/costos/cobertura, reserva/expiración y forma de acreditar ownership/recibo del comprador. No se añadieron INSERT públicos ni acceso por UUID para mantener checkout a costa de seguridad.
2. Revisión humana de esta matriz y efecto de no leer desde DB el recibo de un comprador sin contrato de acceso. Los query params de la página siguen siendo información presentada por el cliente, **no prueba de pago/orden válida**.
3. Contrato y autorizaciones HTTP de Mercado Pago, en PAY-02; el uso de `service_role` allí puede eludir la frontera de RLS si el endpoint no autoriza correctamente.
4. Compatibilidad real del esquema y orden de integración de las dos migrations Storage pendientes, caller integrado y nueva migration SEC-01. No ejecutar el candidato ni desplegar aisladamente sobre el checkout actual.
5. Revisar atributos legacy que la UI ya publica (por ejemplo, atributos libres con datos de proveedor); no se inventó una whitelist comercial nueva de atributos. Revisar vistas/RPC/default grants no presentes en el repo; futuros cambios necesitan tests de permisos.

La implementación local es revisable; no certifica que la tienda esté lista para Production ni termina PAY-01/PAY-02/STG-01.

## Complemento PAY-01 en rama independiente

Las descripciones anteriores registran el candidato SEC-01 original. En `codex/pay-01-atomic-checkout`, el cliente ya envía solo identidad de productos/cantidades y datos de checkout a un handler autenticado; no hace inserts anon. El recibo se limita al comprador verificado y descarta importes/números de la URL. Nuevas tablas/RPC conservan permisos privados. [Contrato, matriz extendida y decisiones](CHECKOUT_PAY01.md). La configuración sigue vacía y la habilitación comercial bloqueada; no asumir que este complemento esté integrado en SEC-01 o Production.

## Adaptación manual de PAY-01

La migration candidata `202610110003_pay01_manual_payments.sql` conserva SEC-01 y añade `checkout_manual_payments` con RLS y ACL privadas. Anon/authenticated no leen/escriben recibos ni ejecutan confirmación o vencimientos. Administradores allowlisted usan acciones servidor con sesión verificada; admin_id proviene de esa sesión. La acreditación completa y el lifecycle son atómicos, y confirmed no acredita por sí mismo. Los endpoints Mercado Pago quedan globalmente inactivos (410); el archivo legacy no tiene callers activos. [SQL read-only extendido](../reports/pay01-manual-payments-read-only.sql), probado con fixtures aislados: cero privilegios públicos indebidos, ocho funciones invoker/service-only. No se verificó ni modificó Production.

## Compatibilidad de integración con grants mínimos

El lifecycle PAY-01 actualiza movement_type y reason en inventory_movements. SEC-01 garantiza SELECT/INSERT pero no ese UPDATE. La prueba de integración sin default grants reproduce 42501 y rollback de acreditación. La nueva migration `202610110005_pay01_inventory_transition_permissions.sql` concede UPDATE de esas dos columnas solo al servicio; deja sin cambios permisos públicos y cantidad/stock. No revoca ni normaliza grants de servicio ya existentes; la inspección read-only informa si existe UPDATE amplio. [Informe](../reports/sec01-pay01-integration-readiness-20261011.md).

## PAY-01 invitado y cotizaciones nacionales (candidato local)

Supabase Auth anónimo verificado no equivale al rol SQL anon: usa authenticated, sin nuevas escrituras directas ni EXECUTE públicos. Usuarios is_anonymous son rechazados como administradores aunque tengan email allowlisted. Recibos/cotizaciones filtran por UUID de sesión verificado antes de crear cliente privilegiado; no se autoriza con IDs del body.

checkout_shipping_quote_requests: RLS activo, anon/authenticated sin privilegios; service_role SELECT/INSERT/UPDATE explícitos, sin DELETE. get_checkout_shipping_quote y request_checkout_shipping_quote: EXECUTE solo service_role, SECURITY INVOKER y search_path fijo. La cotización no modifica pedidos/stock. Sin tokens o datos personales en respuestas de bootstrap/metadata de idempotencia. Configurar y probar CAPTCHA real en Supabase antes de habilitar Anonymous Sign-ins; flag invitado cerrado por defecto.
