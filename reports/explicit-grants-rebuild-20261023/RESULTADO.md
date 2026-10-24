# Reconstrucción con permisos explícitos — resultado local

23/10/2026, rama `codex/explicit-grants-rebuild-20261023`, base `9c6f367`. No se modificó Production ni se ejecutó Supabase CLI reset, push, merge o deploy.

## Correcciones

- Nuevo historial exclusivo para bases vacías en `supabase/rebuild`: esquema inicial versionado, matriz mínima de tablas base y permisos de compras antes de sus consumidores. Los 34 SQL canónicos y schema.sql permanecen intactos (diff vacío contra base).
- Duplicación 202609180002 resuelta en copias de reconstrucción: suppliers_admin usa 202609180003; contenido/hash idénticos, sin inventar ni reparar ledger productivo.
- Manifiesto completo de 37 pasos, incluyendo componentes, precios de combos y seguridad conjunta; cada copia y fuente tienen SHA-256 verificado. Configuración staging actualizada a major 17.
- Eliminados defaults GRANT ALL de service_role en PAY-01 y SEC-01; usan las mismas concesiones explícitas del bootstrap. Las pruebas de deriva maliciosa de SEC-01 mantienen grants amplios intencionales como escenario negativo, no como prerrequisito funcional.
- Suites de migraciones individuales ahora cargan el prefijo histórico explícito para no ejecutar dos veces contratos incluidos en el manifiesto completo.

## Ensayo ejecutado

Docker local, imagen oficial postgres:17.6 ya disponible, contenedores exclusivos con tmpfs y puertos 127.0.0.1 aleatorios; esquemas y datos sintéticos. Los contenedores del ensayo se detuvieron/eliminaron al terminar. No se tocaron contenedores o bases existentes.

**73 pruebas integradas + 1 estática del manifiesto aprobadas, 0 fallos, 0 omisiones.** ESLint focalizado sin errores y sintaxis de runners modificados comprobada. No se ejecutó build Next.js porque no cambian código de aplicación, dependencias o contratos TypeScript.

Comprobaciones nuevas: aplicación completa de 37 pasos con grants automáticos de tablas, secuencias y funciones desactivados; compra/borrador/cancelación como service_role inmediatamente tras fundación y permisos; RLS en las 39 tablas públicas; vistas invocadoras legibles por los tres roles; costos y tablas privadas denegados a clientes; RPC de aplicación no públicas; auditoría sin UPDATE/DELETE/TRUNCATE; ausencia de CREATE/membresías privilegiadas en clientes; executor de mantenimiento sin acceso directo a tablas; nuevos objetos sin acceso automático; guarda contra base poblada y rollback sin pérdida.

Suites afectadas aprobadas: reconstrucción (11), seguridad conjunta (6), transacción de publicación de cargadores (9), precio de combos (20), inventario por componentes (27). Comprobación estática del manifiesto staging (1).

Los escenarios reutilizados incluyen cinco presentaciones comerciales, ambos conectores, precio especial/descuento único, pagos combinados, reservas/liberación idempotente, última unidad concurrente, recepción, cancelación, devolución, referencias históricas y rechazo público de costos/RPC. Todo exclusivamente sintético.

## Alcance y riesgos pendientes

- **APTO para reconstrucción PostgreSQL aislada bajo este paquete.** No autoriza ni requiere aplicar cambios en Production por sí mismo.
- El directorio canónico raíz conserva su historia aplicada y su versión duplicada: usar el paquete generado de staging para bases nuevas. No hacer db push o migration repair sobre una existente.
- No se ejecutó una reconstrucción del stack Supabase completo con GoTrue/PostgREST/Storage. El fixture Storage representa metadatos de pruebas, no instalaciones reales; no copiarlo a Supabase. Tampoco se corrieron los runners antiguos que requieren binarios Windows de PostgreSQL; el ensayo integral y las suites Docker cubrieron el paquete y su ACL restrictiva, y los runners modificados recibieron revisión de sintaxis/estática.
- Defaults sólo para el creador postgres del entorno nuevo. Otros creadores deben validarse por separado; no se cambian supabase_admin ni roles internos.
- Autenticación externa, buckets/configuración real y datos semilla comerciales requieren su procedimiento separado; el paquete no los inventa ni los copia desde Production.

Reproducir: generar copias con `node scripts/prepare-checkout-staging.mjs`; definir SFSTORE_TEST_DOCKER con el ejecutable Docker local y ejecutar `node --test tests/explicit-grants-rebuild-postgres.test.mjs`. Ver `supabase/rebuild/README.md` y `staging/README.md`. No usar una conexión remota.


## Cierre integrado — 24/10/2026

La validación adicional del stack real quedó aprobada mediante Compose descartable, con aislamiento verificado antes de arrancar y siete comprobaciones HTTP. Supera el pendiente de Auth/PostgREST/Storage descrito en el informe original, conservando sus límites comerciales. Ver [informe final](../supabase-full-local-rebuild-20261024/FINAL-RESULTADO.md). Las 73 pruebas PostgreSQL no se repitieron. No hay autorización implícita de cambios productivos.
