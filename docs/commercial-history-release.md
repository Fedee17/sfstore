# Historial comercial y Analytics — candidato Fase2C

## Alcance y base

Rama candidata: `codex/commercial-history-release-20261017`, creada directamente desde `da24966ef145cbe340f50ee587488328d952cb89`, la base del deployment productivo `dpl_FrCUtcu1k3G2VuWAkMRgu85YcuAj`. La procedencia se verifica enlazando el alias actual de Vercel con el ID inmutable, el registro de publicación y el archivo git archive cuyo hash y commit están certificados. La respuesta resumida del conector Vercel no proporciona el SHA del deployment CLI; no debe confundirse esa omisión con una consulta Git en vivo.

Cambios: lectura comercial común, listados/detalles históricos de Compras y Ventas, Analytics mensual, guardas adicionales contra pagos/confirmaciones históricos, pruebas y documentación. No se incorporan diferencias de main. No cambia ningún contrato SQL, paquete, permiso, formulario de alta operativo, ruta de checkout o configuración de despliegue.

La aplicación consume columnas existentes. La captura productiva anterior a Fase1 contiene58 de61 columnas requeridas; las tres restantes (order_items.list_unit_price_snapshot, order_items.unit_cost_snapshot, order_payments.store_payment_method) fueron creadas y verificadas por el postcheck productivo13/13 de Fase1E. Los propietarios y permisos se conservaron en ese postcheck. Esta evidencia demuestra compatibilidad con el estado entonces certificado, no ausencia de cambios de esquema posteriores.

## Puerta de publicación de sólo lectura

`reports/commercial-history-release-preflight-read-only.sql` comprueba61 columnas/tipos, SELECT efectivo de service_role, bypass RLS requerido por el cliente administrativo y PostgreSQL17, en BEGIN READ ONLY con timeouts y ROLLBACK. Sólo consulta pg_catalog y funciones incorporadas de inspección. No lee filas comerciales, secretos ni cuerpos de funciones. Su etiqueta de proyecto es declarativa: verificar primero el proyecto en la URL del SQL Editor.

El Dashboard no pudo controlarse desde el navegador durante esta preparación (timeout CDP). No se abrió una conexión alternativa con credenciales administrativas. Antes de publicar debe obtenerse all_checks_passed=true ejecutando ese único bloque en el SQL Editor de xspvoicelbxlmtqoiolc, mediante la sesión existente cuando el controlador vuelva a responder o por el propietario. Su resultado es metadata sin datos personales y puede procesarse directamente; no requiere una nueva captura integral ni exportar archivos. Una diferencia detiene la publicación: no aplicar DDL ni cambiar permisos para hacer pasar la consulta.

La consulta se ensaya primero en PostgreSQL local descartable con el mismo esquema de fixtures del modelo, incluida verificación de que la transacción termina en rollback. No es una migración y no debe ejecutarse junto a otros SQL.

## Validación y rendimiento

Ejecutar sobre el commit candidato exacto: instalación con npm ci, suite automatizada, integración real local con Auth/PostgREST/PostgreSQL y UI, TypeScript, lint, build con variables ficticias loopback y Gitleaks. La integración debe verificar todos los IDs180/129 por páginas, detalles de sólo lectura, rechazos del servidor, pagos/fechas/costos/exclusiones y formularios actuales. Guardar resultados privados bajo staging/runtime, fuera del commit.

Las listas solicitan20 padres por página y cargan relaciones por lotes IN, no por operación. Analytics usa una lectura compacta completa y una proyección para hasta seis meses; nunca seis lecturas completas. El presupuesto existente es30s, con paginación hasta página vacía y fallo explícito si se agota. Las mediciones en PostgREST local con clamp7 son evidencia de completitud y comportamiento, no una garantía de latencia en Vercel/Production. No hay una consulta N+1 por producto; el volumen total sigue aumentando con el historial y deberá optimizarse si se aproxima al presupuesto. No se introduce caché compartida entre usuarios.

La lectura reúne varios SELECT y no constituye snapshot global. El margen es parcial por cobertura de costos guardados; no certifica ganancias históricas, caja neta ni facturas de proveedores. Los importes con fecha imputada, paid_at NULL y ensayos conocidos excluidos siguen identificados. Detalles del contrato: commercial-reporting-read-contract.md.

## Procedimiento de publicación — requiere autorización nueva

1. Congelar el SHA candidato, confirmar árbol limpio, diff exclusivo y pruebas correspondientes a ese SHA. Confirmar que el alias siga en la base esperada y registrar el deployment anterior para recuperación. Si otro cambio fue publicado, detenerse y reconciliar explícitamente; nunca incluir main por conveniencia.
2. Completar la puerta puntual de61 columnas y permisos. No se requieren migraciones, SQL de escritura, reimportación ni cambios de Auth/Storage. Un respaldo anterior no debe presentarse como una copia actual; este cambio de lectura no necesita restaurar datos para revertirlo. No ejecutar auxiliares de respaldo sin autorización.
3. Con autorización expresa de despliegue: construir el SHA exacto como Production staged usando --prod --skip-domain, mantener la protección autenticada antes de la promoción y comprobar READY, proyecto y procedencia. No crear Preview pública conectada a datos productivos.
4. Verificar páginas administrativas y lectura del período autorizado sin registrar ventas ni confirmar compras. No exponer en logs nombres de clientes, proveedores, pagos o importes comerciales. La promoción al dominio requiere alcance autorizado explícito; no implica merge ni push a main.
5. Tras promover, comprobar alias/commit, acceso anónimo denegado, Compras/Ventas actuales e históricas, fechas/pagos sin inventar costos, Analytics mensual, catálogo y checkout por lecturas únicamente. No crear pedidos de ensayo ni consumir stock. Los formularios operativos no cambiaron; ante un envío de resultado incierto, conservar la clave idempotente y verificar el resultado antes de reintentar.

## Detención y recuperación

Detener antes de promover ante preflight distinto, base/commit incorrecto, secretos en artefactos, build fallido, protección insuficiente o errores de lectura. El deployment publicado sigue atendiendo el dominio.

Si el nuevo dashboard falla tras promover: no convertir fallos en cifras cero ni cambiar permisos. Revertir al deployment registrado de Fase1E sólo con autorización operacional correspondiente. Aquí la reversión de Vercel es compatible porque el candidato no modifica PostgreSQL ni los contratos de escritura; es diferente de la transición SQL de Fase1. Las operaciones creadas legítimamente durante la ventana se conservan; nunca restaurar una base para resolver un fallo de pantalla. Recargar páginas administrativas y comprobar catálogo/checkout por lectura. Ante resultado incierto de una operación física, no reenviar formularios ni crear otra clave automáticamente.

No se requiere pausar compras online o ventas físicas sólo para introducir estas vistas de lectura. Se recomienda cerrar formularios pendientes antes de una promoción normal para evitar cambios de Server Actions entre deployments. Si se detecta un incidente operativo, detener la operación afectada y diagnosticar; una pausa global o cambios productivos adicionales requieren su autorización específica.

## Límites residuales

La instalación hereda los avisos de dependencias del lockfile productivo: esta fase no los corrige ni añade paquetes. El backlog de dependencias se mantiene fuera de alcance; no aplicar npm audit fix --force. La publicación queda APTO CON CONDICIONES hasta completar el preflight actual, revisar el candidato y recibir autorización explícita para desplegar/promover. No hay incompatibilidad confirmada que requiera una migración.
