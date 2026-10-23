# Historial separado para reconstrucción nueva

Sólo bases locales nuevas y vacías. No es una migración correctiva para Production, un backup restaurado ni un proyecto existente. Los 34 archivos de `supabase/migrations` y `supabase/schema.sql` mantienen sus bytes/historia.

1. `202609100001_initial_schema.sql`: copia versionada de schema.sql, precedida de una guarda de base vacía y marcador sintético; transaccional. No copia datos comerciales.
2. `202609100002_explicit_base_permissions.sql`: RLS base, schema USAGE para los roles API, sin CREATE público; grants de tabla exclusivamente de servicio necesarios para la aplicación. Revoca defaults futuros de tablas/secuencias y EXECUTE de funciones (incluido PUBLIC global, que no puede neutralizarse con un REVOKE sólo de esquema).
3. `202609160002_purchase_explicit_permissions.sql`: se intercala inmediatamente después de la fundación de compras. suppliers/purchases: SELECT/INSERT/UPDATE; purchase_items: también DELETE para reemplazar borradores. Ningún permiso público. Permite usar RPC SECURITY INVOKER desde su creación, sin esperar a SEC-01.

`node scripts/prepare-checkout-staging.mjs` intercala estos archivos con las fuentes originales. Único alias: suppliers_admin 202609180002 pasa a 202609180003 en la copia generada, conservando el contenido. El manifiesto registra ambos nombres y SHA-256; no inventa historia productiva ni propone migration repair. Todas las copias son idénticas a su fuente, hashes normalizados a LF como en el generador anterior.

La base canónica raíz continúa deliberadamente sin renombrarse; para bases nuevas usar el paquete generado bajo staging/supabase, no ejecutar ciegamente la carpeta raíz. Un futuro proceso sobre una base existente exige comparar su ledger real y autorizar otra operación.

## Frontera de permisos

service_role usa CRUD sólo en tablas operativas que lo requieren; movimientos y auditorías conservan grants específicos. No se conceden TRUNCATE/REFERENCES/TRIGGER/MAINTAIN ni se habilitan permisos por defecto. anon/authenticated reciben únicamente el SELECT de catálogo ya declarado por SEC-01 y las migraciones de vistas invocadoras, con columnas y RLS existentes; sin costos, pedidos, pagos, recetas privadas ni RPC comerciales. La secuencia de checkout_audit conserva USAGE de servicio de su migración original. Las tablas de mantenimiento quedan privadas; executor NOLOGIN conserva sólo la capacidad explícita de expiración.

Los defaults se configuran para el creador postgres del entorno nuevo. No cambiar defaults de supabase_admin ni otros roles internos. Si un futuro creador usa otra identidad, debe validarse por separado; no asumir que los defaults de postgres la cubren.

No cambia contratos de checkout ni ventas, ni carga precios/inventario/configuración productiva. Las pruebas sintéticas de seguridad pueden introducir grants amplios deliberadamente como ataque/deriva y comprobar su rechazo; eso no es un permiso de bootstrap ni un workaround para aprobar.
