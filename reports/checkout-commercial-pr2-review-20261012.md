# Checkout comercial de PR #2: revisión local del 12 de octubre de 2026

## Alcance y reglas finales

Transferencia bancaria como único pago web, descuento único del 25% sobre lista y acreditación manual del 100% del total congelado. Efectivo web rechazado y Mercado Pago permanece deshabilitado (410). Corregida la comparación Origin/Host que rechazaba la sesión de invitado al normalizar NextURL la dirección loopback. Auth verificado, CAPTCHA y RLS permanecen activos.

Reserva inicial de 24 horas. Un aviso registrado oportunamente con comprobante privado mantiene el stock hasta revisión administrativa; el comprobante no acredita dinero. Alerta visible al superar el objetivo configurable de 48 horas. Rechazo con motivo cancela y libera en una transacción; confirmación exige el importe exacto y convierte la reserva en venta sin otro descuento de stock.

## Migraciones

- Se conserva sin reescribir 202610120001_web_transfer_payment_reports.sql: estados, RPC, auditoría, política comercial y Storage privado.
- Se agrega 202610120002_remove_global_reservation_budget.sql: elimina el presupuesto compartido del 80%, conserva límites por comprador y permisos RPC exclusivos del servidor. El campo histórico max_reserved_percent queda documentado como inactivo.
- Aplicadas exclusivamente al Supabase local existente, cuyo historial contiene 26 migraciones. No se ejecutó SQL remoto, reset ni limpieza de datos.
- Manifiesto y generador calculan hashes SHA-256 sobre texto LF para portabilidad Windows/Linux. Las copias SQL siguen siendo idénticas a sus fuentes; no se altera contenido de migraciones aplicadas.

## Controles comerciales y de acceso

Valores predeterminados configurables en PostgreSQL: 2 pedidos pendientes, 6 unidades reservadas por comprador, 2 por producto, 2 operaciones nuevas/minuto y 6/hora; 1 aviso simultáneo; 2 rechazos en 7 días requieren revisión; un vencimiento o cancelación reciente impone una hora de espera. Excepciones administrativas temporales, con motivo e historial, permiten atender casos legítimos conservando frecuencia y stock real. No se utiliza IP como identidad.

Bloqueos por comprador y por producto, orden de bloqueos consistente, idempotencia por operación y transiciones atómicas. Los reintentos con la misma clave no crean reservas adicionales. Propiedad de pedidos comprobada antes de acceder a comprobantes; bucket privado sin políticas públicas; descarga autenticada como adjunto, sin caché y auditada. PDF/PNG/JPEG hasta 5 MiB con tipo y firma verificados; no se sobrescriben archivos.

## Validación ejecutada

| Control | Resultado |
| --- | --- |
| Suite comercial con Supabase real y navegador | 16/16 aprobadas, 0 fallidas |
| Regresión de compra invitada con Supabase real | 9/9 aprobadas, 0 fallidas |
| Vencimientos, locks y rollback con Supabase real | 10/10 aprobadas, 0 fallidas |
| Suite general | 648 aprobadas, 0 fallidas, 5 pruebas omitidas; 6 suites optativas omitidas |
| Build Next.js | Aprobado |
| TypeScript --noEmit | Aprobado |
| Lint | 0 errores; 10 warnings preexistentes fuera del checkout |
| Gitleaks y git diff --check | Aprobados; Gitleaks sin hallazgos en archivos completos, índice e historial de la PR |

Verificados stock 1 y 2 comprables por completo, dos compradores reservando ambas unidades y carrera por la última unidad sin sobreventa. Expiraciones repetidas y concurrentes restituyen exactamente una vez; una transacción revertida no deja restitución ni movimientos. Pedidos pagados y avisos pendientes de revisión no devuelven stock. También se verificaron aviso/reintentos, rechazo, monto parcial rechazado, acceso entre compradores, RPC directas denegadas, autenticación administrativa y comprobantes privados.

Invariantes finales de la base local: 0 restituciones duplicadas, 0 restituciones de pedidos pagados, 0 stocks negativos y bucket de comprobantes privado.

Las suites omitidas requieren runners/servicios optativos no activados por la ejecución general. Las tres suites reales se ejecutaron por separado con opciones explícitas. CAPTCHA utiliza las credenciales oficiales de prueba en el entorno local; no certifica configuración productiva.

## Exclusiones de la publicación

Se publican código, pruebas reproducibles y este resumen agregado. Permanecen ignorados y privados los archivos de entorno, claves, contraseñas, cookies, tokens, comprobantes, identificadores generados, evidencias JSON/logs y copias SQL/runtime locales. No se incorporan pedidos, productos ni exportaciones de la base sintética.

## Riesgos y trabajo pendiente

- Un comprador puede obtener varias identidades anónimas: los límites por sesión no equivalen a una identidad durable por persona. Retirar el presupuesto global deja este riesgo explícito; conservar CAPTCHA y monitorizar expiraciones/rechazos, sin bloquear conexiones compartidas.
- Operar un liberador periódico autorizado, reintentar filas omitidas por SKIP LOCKED y controlar errores. El panel actual ejecuta lotes manuales; no se instaló un cron remoto.
- Atender revisiones atrasadas: la reserva se mantiene hasta decisión explícita, según la política aprobada. La alerta es visible en el panel; no hay notificación externa.
- Definir retención de comprobantes y cargas abandonadas. El historial del panel está acotado a los últimos 1000 eventos por página, no es una consulta exhaustiva individual.
- Carga sostenida, carreras extensas con varios productos y operación productiva completa siguen pendientes. Revisar configuración bancaria y CAPTCHA reales mediante un procedimiento separado.

PR #2 debe mantenerse en borrador. Publicar el commit de consolidación para revisión, sin merge, despliegue ni migraciones remotas. La validación local completa de estos escenarios no constituye certificación para Production.
