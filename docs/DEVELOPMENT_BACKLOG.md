# Backlog propuesto — 2026-10-10

Base: main `7a8a105`. Ninguna tarea de este backlog fue iniciada durante la preparación. Los cambios Storage/lint existentes se referencian para revisión, no como implementaciones pendientes a repetir. Autonomía aplica al desarrollo autorizado; integración/publicación/Production conservan sus límites propios.

Prioridades: P0 = seguridad/integridad crítica; P1 = estabilidad/ventas/verificabilidad; P2 = calidad/experiencia; P3 = ampliación funcional. Complejidad baja/media/alta expresa alcance relativo, no promesa de horas. La preparación registró todas como PROPUESTAS; Fase 2 completó SEC-02, TXT-01 y DOC-01 en rama local sin integración. LINT-01 y STG-01 tienen implementación externa pendiente de revisión.

## Orden de ejecución propuesto

Primero solicitar alcance para DEP-01, PAY-01/PAY-02, SEC-01 y revisión STG-01; no ejecutar acciones sensibles hasta aprobación. QA-01 y SEC-02 pueden delegarse como objetivos pequeños en paralelo lógico sin compartir archivos. QA-02 depende de runtimes y baseline definido. LINT-01 espera la decisión sobre cambios existentes. Después CAT-01, documentación/encoding y UX/atributos; CFG-01 queda sujeto a prioridad comercial.

No habilitar una automatización recurrente ni pasar a otra tarea sin encargo. Consultar decisiones pendientes en PROJECT_CONTEXT y AGENTS para reglas de coste, intentos y entrega.

## Índice

| ID | Prioridad | Autonomía | Complejidad | Título |
| --- | --- | --- | --- | --- |
| DEP-01 | P0 | RESTRINGIDA | Alta | Evaluar y corregir advisories de Next.js y toolchain |
| PAY-01 | P0 | RESTRINGIDA | Alta | Checkout autoritativo, atómico e idempotente |
| PAY-02 | P0 | RESTRINGIDA | Alta | Verificar y fortalecer conciliación Mercado Pago |
| SEC-01 | P0 | RESTRINGIDA | Alta | Versionar y comprobar permisos de tablas públicas |
| STG-01 | P0 | RESTRINGIDA | Media | Revisar corrección Storage existente y plan de integración |
| DEP-02 | P1 | RESTRINGIDA | Alta | Resolver riesgo de importación xlsx |
| QA-01 | P1 | AUTÓNOMA | Media | Facilitar validaciones locales reproducibles |
| QA-02 | P1 | SUPERVISADA | Media | Preparar CI con fixtures y separación de despliegue |
| LINT-01 | P1 | AUTÓNOMA | Baja | Incorporar corrección ya existente de nueve errores |
| CAT-01 | P1 | SUPERVISADA | Media | Definir respuesta a catálogo vacío o caído |
| SEC-02 | P1 | AUTÓNOMA | Baja | Reducir logs temporales de login |
| DOC-01 | P2 | AUTÓNOMA | Baja | Actualizar documentación histórica y README |
| TXT-01 | P2 | AUTÓNOMA | Baja | Corregir encoding en metadata pública |
| UX-01 | P2 | SUPERVISADA | Media | Revisar accesibilidad y deuda de imágenes |
| REC-01 | P2 | SUPERVISADA | Media | Verificar cobertura de atributos de recomendaciones |
| CFG-01 | P3 | SUPERVISADA | Media | Definir configuración editable del negocio |

## DEP-01 — Evaluar y corregir advisories de Next.js y toolchain

- **Estado:** PROPUESTA.
- **Descripción:** Comprobar versiones afectadas, runtime/rutas expuestas y opciones de actualización; preparar upgrade acotado con compatibilidad App Router/React/Tailwind y rollback. Fuente: npm audit de esta ejecución, crítica en Next.js y propagación en toolchain.
- **Prioridad:** P0.
- **Complejidad estimada:** Alta.
- **Dependencias:** Aprobación de alcance de seguridad crítica; guías Next de la versión elegida.
- **Riesgo:** Alto: framework y seguridad.
- **Nivel de autonomía:** RESTRINGIDA.
- **Criterios de aceptación:** Inventario de advisories con aplicabilidad documentada; versión objetivo justificada; ningún override/fix force ciego; sin desactivar controles; diff compatible y revisable.
- **Validaciones necesarias:** npm ci; npm ls; npm audit comparativo; tsc; lint; 603 tests o suite vigente con PG/browser; build; smoke local de rutas/acciones afectadas.

## PAY-01 — Checkout autoritativo, atómico e idempotente

- **Estado:** IMPLEMENTACIÓN LOCAL EN REVISIÓN en `codex/pay01-guest-national-shipping`, preservando PAY-01/SEC-01 locales. Reservas de 24 horas, descuento único de 25% y precio congelado implementados. Checkout atómico/idempotente con transferencia y efectivo al retirar; acreditación manual administrativa y liberación explícita de reservas preparadas; pasarelas públicas bloqueadas. Habilitación pendiente de configuración efectiva de entrega/acceso del comprador y revisión humana; sin cambios de Production. [Contrato](CHECKOUT_PAY01.md) y [evidencia manual](../reports/pay01-manual-payments-20261011.md), [reglas aprobadas](../reports/pay01-approved-rules-20261011.md), [preparación de integración](../reports/sec01-pay01-integration-readiness-20261011.md) con grant mínimo de lifecycle pendiente. Compra invitada verificada y tarifas nacionales/cotización privada implementadas localmente; configuración Auth/CAPTCHA, tarifas reales y revisión pendientes. [Evidencia](../reports/pay01-guest-national-shipping-20261011.md). Paquete de staging local con historial único y pruebas funcionales preparado; Auth/PostgREST/CAPTCHA reales pendientes de configuración. [Procedimiento](../staging/README.md). Clasificación RESTRINGIDA conservada.
- **Descripción:** Sustituir confianza en precios/carrito e inserts anon separados por un contrato servidor que valide catálogo vigente, cantidades, totales, permisos e idempotencia. Preparar primero decisiones de precio/envío/reserva; conservar UX aprobada.
- **Prioridad:** P0.
- **Complejidad estimada:** Alta.
- **Dependencias:** Aprobación explícita; decisiones comerciales de checkout; SEC-01; entorno sintético independiente.
- **Riesgo:** Alto: pedidos, importes y stock.
- **Nivel de autonomía:** RESTRINGIDA.
- **Criterios de aceptación:** Precios no controlables por cliente; items vinculados a producto válido; permisos mínimos; rollback ante fallos; doble envío no duplica pedido; reglas comerciales aprobadas y trazabilidad.
- **Validaciones necesarias:** Fixtures de precio manipulado/inactivo/sin stock, fallos parciales, replay y concurrencia; DB aislada; tsc/lint/build y suite relevante. No pedidos reales.

## PAY-02 — Verificar y fortalecer conciliación Mercado Pago

- **Estado:** DIFERIDA POR DECISIÓN COMERCIAL. Mercado Pago permanece deshabilitado globalmente; cualquier habilitación requiere autorización comercial explícita y una implementación de seguridad independiente. No desarrollada en la adaptación manual PAY-01.
- **Descripción:** Revisar firma, asociación cuenta/moneda/importe/order, ownership y límites de preferencia; preservar consulta autoritativa Payment. Diseñar reconciliación ante fallo de inventario, replays y pagos tardíos. No asumir que la firma por sí sola resuelve el ledger.
- **Prioridad:** P0.
- **Complejidad estimada:** Alta.
- **Dependencias:** Aprobación explícita; PAY-01; contrato MP vigente y sandbox autorizado.
- **Riesgo:** Alto: dinero y estados/inventario.
- **Nivel de autonomía:** RESTRINGIDA.
- **Criterios de aceptación:** Notificaciones inválidas no alteran ledger; replays no duplican pago/stock; discrepancias quedan registradas sin marcar venta correctamente conciliada; creación de preferencia con control definido.
- **Validaciones necesarias:** Mock SDK: firma inválida, referencia ajena, importe/moneda incorrectos, estados, replay, concurrencia y fallo de stock; sandbox solo con aprobación, nunca cobro real.

## SEC-01 — Versionar y comprobar permisos de tablas públicas

- **Estado:** IMPLEMENTACIÓN LOCAL EN REVISIÓN en `codex/sec-01-supabase-permissions`, base integrada `69049e2`: matriz, migration candidata y lookup privado autorizado. [Evidencia](../reports/sec01-execution-20261010.md) y [matriz](SUPABASE_PERMISSIONS_SEC01.md). Permisos de Production sin comprobar; aplicación/integración bloqueadas hasta contrato PAY-01 y revisión del esquema. Clasificación RESTRINGIDA sin cambios.
- **Descripción:** Preparar matriz de RLS/grants y acceso anon/authenticated/service_role para tablas originales y Storage; comparar con un entorno autorizado. No dar por seguro Production desde migrations parciales; cualquier corrección exige revisión explícita.
- **Prioridad:** P0.
- **Complejidad estimada:** Alta.
- **Dependencias:** Aprobación de cambios críticos; entorno aislado; requisitos PAY-01.
- **Riesgo:** Alto: exposición o interrupción del checkout.
- **Nivel de autonomía:** RESTRINGIDA.
- **Criterios de aceptación:** Matriz verificable; prueba de mínimos privilegios; sin acceso público a PII/pagos; permisos coherentes con checkout servidor; drift de Production se documenta sin escritura.
- **Validaciones necesarias:** Tests SQL aislados por rol: lecturas públicas permitidas, escrituras/PII denegadas, RPC críticas service-only; SQL read-only revisable para inspección autorizada.

## STG-01 — Revisar corrección Storage existente y plan de integración

- **Estado:** REVISIÓN E INTEGRACIÓN LOCAL VALIDADAS en Fase 3; migrations reales, integración a main, deploy y activación siguen pendientes de autorizaciones separadas.
- **Descripción:** Revisar draft PR #1 be25492 y migrations exactas de result/durable admin delete; reaprovechar evidencia y no reimplementar worker. Mantener retención de objetos existentes y apply bloqueado. Preparar rollout separado de merge/migration/deploy/activación.
- **Prioridad:** P0.
- **Complejidad estimada:** Media.
- **Dependencias:** Revisión del propietario; aprobación específica para cada efecto restringido; estado vigente PR #1.
- **Riesgo:** Alto: archivos reales y compatibilidad DB.
- **Nivel de autonomía:** RESTRINGIDA.
- **Criterios de aceptación:** PR revisada con contratos de guardado compatibles; migrations aditivas y verificación read-only; no interpretar agregar result como habilitar eliminación; Production y activación siguen separadas hasta autorización.
- **Validaciones necesarias:** Checks de la rama vigente, tests de retención/concurrencia/rollback/retry; validar migrations solo en DB sintética. No ejecutar scripts apply ni limpiar Storage.

## DEP-02 — Resolver riesgo de importación xlsx

- **Estado:** PROPUESTA.
- **Descripción:** Evaluar SheetJS xlsx 0.18.5 y alternativa/versionado confiable para parsing de archivos; conservar clasificación, preview y confirmación segura. npm audit indica prototype pollution/ReDoS y sin fixAvailable en el rango actual.
- **Prioridad:** P1.
- **Complejidad estimada:** Alta.
- **Dependencias:** Aprobación para corrección de seguridad crítica del parser; DEP-01 si afecta toolchain.
- **Riesgo:** Alto: parser e importaciones de datos.
- **Nivel de autonomía:** RESTRINGIDA.
- **Criterios de aceptación:** Origen/version objetivo justificados; límites y rechazo seguro de entradas malformadas; preview y confirmación sin alteración comercial; no importar en Production.
- **Validaciones necesarias:** Fixtures XLSX sintéticos válidos/malformados/grandes; límites de tiempo/memoria, clasificación y replays; audit y suite de importación, tsc/build.

## QA-01 — Facilitar validaciones locales reproducibles

- **Estado:** PREPARADA, NO IMPLEMENTADA; baseline local `531d411` validado, pendiente de aceptación y encargo.
- **Descripción:** Documentar y después encapsular runner de tests opcionales PG/Chromium sin credenciales reales, con preflight que distinga dependencias ausentes y skips; agregar scripts de tests explícitos sin alterar tests para que pasen.
- **Prioridad:** P1.
- **Complejidad estimada:** Media.
- **Dependencias:** Alcance delegado; contratos actuales de tests.
- **Riesgo:** Bajo.
- **Nivel de autonomía:** AUTÓNOMA.
- **Criterios de aceptación:** Un desarrollador ejecuta suite reproducible; CI/local informa skips y fallos correctamente; versiones de runtime de pruebas y comandos documentados; no dependencia de otro worktree como contrato permanente.
- **Validaciones necesarias:** Instalación limpia en entorno aislado; ejecución sin runtime opcional informa límite; ejecución completa reproduce passes; verificar exit codes.

## QA-02 — Preparar CI con fixtures y separación de despliegue

- **Estado:** PROPUESTA.
- **Descripción:** Definir workflow CI para tsc/lint/test/build y dependencias sin Production ni deploy automático. Incluir runtimes de integración requeridos y coste/tiempo de checks.
- **Prioridad:** P1.
- **Complejidad estimada:** Media.
- **Dependencias:** QA-01; decisión de proveedor CI, secretos y política branch/deploy; STG-01 para baseline lint.
- **Riesgo:** Medio: infraestructura y ejecución remota.
- **Nivel de autonomía:** SUPERVISADA.
- **Criterios de aceptación:** Workflow revisable; solo fixtures y credenciales no productivas si necesarias; logs no contienen secretos; merge gates y deploy separados; skips explícitos.
- **Validaciones necesarias:** Validación del workflow en rama autorizada; install limpio y checks; revisión de permisos/trigger. Publicación/activación externa requiere autorización.

## LINT-01 — Incorporar corrección ya existente de nueve errores

- **Estado:** CORRECCIÓN VALIDADA EN BASELINE LOCAL `531d411`: 0 errores globales; integración/publicación todavía pendientes.
- **Descripción:** No repetir cambios: verificar la corrección de enlaces internos y location.assign en PR #1 y decidir integración de ese trabajo antes de nuevas correcciones lint. La implementación ya está pendiente fuera de main.
- **Prioridad:** P1.
- **Complejidad estimada:** Baja.
- **Dependencias:** STG-01/revisión de PR #1; autorización de integración.
- **Riesgo:** Bajo en código; integración depende de PR restringida.
- **Nivel de autonomía:** AUTÓNOMA.
- **Criterios de aceptación:** Cero errores lint en baseline integrado; no desactivar reglas; historial no duplica parches; merge no forma parte de autorización autónoma.
- **Validaciones necesarias:** Lint y navegación/checkout local afectados; revisar diff existente; tsc/build. No merge automático.

## CAT-01 — Definir respuesta a catálogo vacío o caído

- **Estado:** PROPUESTA.
- **Descripción:** Resolver fallback silencioso de services/products.ts: acordar comportamiento para error vs vacío y evitar presentar disponibilidad/precios de respaldo como actuales. Implementar solo tras revisar UX y política comercial.
- **Prioridad:** P1.
- **Complejidad estimada:** Media.
- **Dependencias:** Decisión del propietario de fallback; PAY-01 para checkout de catálogo válido.
- **Riesgo:** Medio: conversión/disponibilidad.
- **Nivel de autonomía:** SUPERVISADA.
- **Criterios de aceptación:** Errores y catálogo legítimamente vacío son distinguibles; no revival de productos históricos; mensajes claros; respaldo permitido solo según política acordada.
- **Validaciones necesarias:** Mocks Supabase: éxito, vacío, error, categoría inactiva, slug faltante/histórico; UI móvil y tests de visibilidad/sitemap.

## SEC-02 — Reducir logs temporales de login

- **Estado:** COMPLETADA EN RAMA LOCAL `codex/autonomous-maintenance-batch-1`; pendiente de revisión/publicación/integración autorizada.
- **Descripción:** Retirar TEMP DEBUG y registros de correo/allowlist sin modificar autenticación/autorización; conservar diagnóstico por códigos sin PII ni tokens.
- **Prioridad:** P1.
- **Complejidad estimada:** Baja.
- **Dependencias:** Alcance delegado; contrato allowlist sin cambios.
- **Riesgo:** Bajo.
- **Nivel de autonomía:** AUTÓNOMA.
- **Criterios de aceptación:** Login/denegación/logout sin cambio funcional; no email/lista/password/token en logs; errores operativos identificables.
- **Validaciones necesarias:** Tests de autorización y captura de logs sintéticos para éxito/denegación/fallo; tsc/lint específico.

## DOC-01 — Actualizar documentación histórica y README

- **Estado:** COMPLETADA EN RAMA LOCAL `codex/autonomous-maintenance-batch-1`; pendiente de revisión/publicación/integración autorizada.
- **Descripción:** Alinear README, checklist Production, guía Storage y pendientes de marca/banners con evidencia actual; corregir ADMIN_EMAIL fallback inexistente y separar estados históricos de estados verificados. Mantener enlaces/reportes previos.
- **Prioridad:** P2.
- **Complejidad estimada:** Baja.
- **Dependencias:** Alcance delegado; STG-01 si describe guardado/retención aún no integrado.
- **Riesgo:** Bajo.
- **Nivel de autonomía:** AUTÓNOMA.
- **Criterios de aceptación:** Comandos reproducibles; sin afirmar deploy verificado; fuente de auth correcta; activos actuales reconocidos; historia preservada sin duplicar guías.
- **Validaciones necesarias:** Revisión de referencias/paths/commands contra source; diff check y comprobación de enlaces locales; no pruebas de Production.

## TXT-01 — Corregir encoding en metadata pública

- **Estado:** COMPLETADA EN RAMA LOCAL `codex/autonomous-maintenance-batch-1`; pendiente de revisión/publicación/integración autorizada.
- **Descripción:** Corregir mojibake observado en app/layout.tsx, sin cambiar claims comerciales ni reglas. Revisar contenido puntual relacionado en UTF-8 sin reescritura general.
- **Prioridad:** P2.
- **Complejidad estimada:** Baja.
- **Dependencias:** Alcance delegado; texto comercial existente.
- **Riesgo:** Bajo.
- **Nivel de autonomía:** AUTÓNOMA.
- **Criterios de aceptación:** Metadata renderiza árabes/según/ocasión correctamente; contenido semántico igual y sin sustituciones masivas.
- **Validaciones necesarias:** Inspección de strings UTF-8, metadata local generada y build; tests focalizados solo si aportan cobertura.

## UX-01 — Revisar accesibilidad y deuda de imágenes

- **Estado:** PROPUESTA.
- **Descripción:** Medir navegación teclado, focus, labels, contraste y responsive de catálogo/checkout/admin y evaluar warnings img por componente/origen. Resolver en cambios pequeños sin rediseño unilateral.
- **Prioridad:** P2.
- **Complejidad estimada:** Media.
- **Dependencias:** Revisión visual del propietario si cambia UI significativa; CAT-01 para estados.
- **Riesgo:** Medio: UX y carga de imágenes.
- **Nivel de autonomía:** SUPERVISADA.
- **Criterios de aceptación:** Hallazgos medidos con evidencia; pantallas móviles sin overflow; flujos accesibles; optimización de imágenes no rompe Storage remoto; sin silenciamiento de warnings.
- **Validaciones necesarias:** Chromium local 360px/desktop, teclado, estados vacío/loading/error; medición de contraste/LCP según alcance; tests de componentes afectados.

## REC-01 — Verificar cobertura de atributos de recomendaciones

- **Estado:** PROPUESTA.
- **Descripción:** Preparar auditoría read-only de cobertura/calidad y fixtures para ranking; acordar normalización/completado de atributos y relación futura con decants. No completar catálogo ni cambiar umbrales automáticamente.
- **Prioridad:** P2.
- **Complejidad estimada:** Media.
- **Dependencias:** Decisiones del propietario y acceso autorizado para lectura; docs/catalog-data-model.md.
- **Riesgo:** Medio: sugerencias comerciales.
- **Nivel de autonomía:** SUPERVISADA.
- **Criterios de aceptación:** Cobertura actual diferenciada de reporte histórico; motivos de ranking verificables; ninguna escritura real ni cambio de pesos; plan de completado revisado.
- **Validaciones necesarias:** Fixtures de atributos vacíos/legacy, límites 40/70, presupuesto, stock y decants; tests actuales de motor/UI; cualquier backfill real requiere aprobación restringida.

## CFG-01 — Definir configuración editable del negocio

- **Estado:** PROPUESTA.
- **Descripción:** Especificar qué datos de lib/brand pueden editarse y cómo se validan/auditan; settings no es hoy un editor implementado. Mantener contactos actuales hasta confirmación comercial.
- **Prioridad:** P3.
- **Complejidad estimada:** Media.
- **Dependencias:** Confirmación de contactos/horarios; revisión UX; SEC-01 para permisos si usa settings.
- **Riesgo:** Medio: información pública y administración.
- **Nivel de autonomía:** SUPERVISADA.
- **Criterios de aceptación:** Alcance acordado; edición validada y autorizada; fallback definido; cambios auditables; sin credenciales ni nuevas reglas de pago/envío.
- **Validaciones necesarias:** Fixtures de valores inválidos, acceso denegado, guardado/fallo; tests y UI local; migrations reales/valores productivos se aprueban aparte.

## Registro de Fase 2

Seleccionadas y completadas: SEC-02 (diagnósticos acotados de login), TXT-01 (acentos metadata) y DOC-01 (README/checklist/guías históricas). Evidencia y validaciones: [informe del lote](../reports/autonomous-maintenance-phase2-20261010.md).

Las 36 entradas de dependencias fueron analizadas read-only: [triage](../reports/dependency-triage-phase2-20261010.md). DEP-01/DEP-02 no comenzaron su implementación; no hubo cambios de paquetes. QA-01 queda como siguiente lote autónomo recomendado una vez definido cómo evitar el solapamiento de package.json/lock con PR #1. No iniciar automáticamente.


## Registro de Fase 3

[Propuesta validada](../reports/integration-baseline-phase3-20261010.md): PR #1 + Fase 2, merge local `531d411`, 636/636 tests, tsc/build PASS, lint global 0 errores y 11 warnings. QA-01 tiene baseline candidato sin conflictos de lock, pero no comenzó. Requiere aceptación/encargo; no exige migrations productivas para desarrollar su runner. STG-01 y LINT-01 reflejan validación local, sin afirmar integración a main/Production. No se actualizaron dependencias.

## Checkout comercial PAY-01 consolidado para PR #2 — 2026-10-12

Transferencia bancaria única, descuento único del 25%, acreditación manual exacta del 100%, reserva inicial de 24 horas y comprobantes privados. Un aviso oportuno conserva la reserva hasta revisión; el atraso se muestra al administrador. Rechazo con motivo y liberación atómica, auditoría y excepciones temporales autorizadas. Auth, CAPTCHA, RLS e idempotencia conservados; Mercado Pago deshabilitado.

Se conserva la migración 202610120001 y se agrega 202610120002 para retirar el presupuesto global del 80%. Se puede comprar la última unidad disponible; siguen vigentes límites por comprador, frecuencia y bloqueos del stock real. Ambas migraciones se aplicaron exclusivamente al Supabase local.

Resultados finales, alcance de publicación y riesgos operativos: [revisión comercial para PR #2](../reports/checkout-commercial-pr2-review-20261012.md). Los identificadores sintéticos, comprobantes, logs y evidencias detalladas permanecen privados en el entorno local. No se certifica Production; faltan operación del liberador periódico, revisiones atrasadas, retención de archivos abandonados, historial exhaustivo y pruebas de carga sostenida.

## PAY-01 — Ejecutor de vencimientos preparado localmente (2026-10-12)

Migración aditiva 202610120003: capacidad SQL privada de mínimo privilegio para reutilizar el liberador existente, auditoría por ejecución/SQLSTATE y monitoreo de backlog/heartbeat. Panel administrativo conserva la liberación manual y muestra últimos lotes, reservas demoradas, avisos protegidos y fallos de supervisión. Payload transaccional probado para Supabase Cron cada cinco minutos, sin crear/activar jobs ni instalar extensiones. Sin endpoint público ejecutor ni credencial de login del ejecutor. Publicación para revisión autorizada; sin merge, deploy o Production.

[Diseño y activación futura](CHECKOUT_RESERVATION_EXECUTOR.md); [revisión agregada para PR #2](../reports/checkout-expiration-pr2-review-20261012.md). La activación real, alertas externas, retención de logs y pruebas de capacidad requieren otro encargo explícito. Auditoría transaccional se revierte con un rollback exterior: se complementará con historial de cron y alerta por ausencia de actividad.

Auditoría para publicación: migración aditiva 202610120004 corrige precedencia implícita de pg_temp en el trigger legado de inventario; conserva 003 y ACL. Regresión con principal SQL sintético sin privilegios de DBA y tablas temporales del caller; el ejecutor no acredita pagos, cambia pedidos arbitrarios ni lee datos privados. Ver resultados de la revisión enlazada.

## PAY-01 — Configuración comercial aprobada (2026-10-12)

Naranja X y alias público aprobado con copia; retiro gratuito sin dirección/horarios inventados. Transporte preferido y cotización administrativa privada antes de aceptar total y reservar stock. Migración nueva 202610120005, sólo local, conserva SQL histórico y controles de Auth/CAPTCHA/RLS, cuotas, locks e idempotencia. No configura tarifas ficticias ni guarda credenciales bancarias. [Cambios, validaciones y pendientes](../reports/checkout-approved-commercial-local-20261012.md). Revisión y publicación en PR #2 autorizadas mediante commit/push normal; sin merge, deploy, SQL remoto ni activación de Cron.

## Auditoría nocturna preparada (2026-10-12)

Rama independiente codex/nightly-audit-clickup: recolectores estáticos/sintéticos, informe diario y cliente ClickUp con deduplicación simulada. Workflows manuales; schedules y sincronización externa desactivados. No modifica PR #2 ni servicios. Arquitectura, costos, resultados y activación autorizada futura: [NIGHTLY_AUDIT.md](NIGHTLY_AUDIT.md).


## Ventas físicas — Fase 1 encargada el 2026-10-17

Implementación local en `codex/store-sales-full-payment-20261017`: cobro completo, descuento por combinación de medios, snapshots de costo y operación atómica/idempotente. Reutiliza el administrador existente; no cambia el checkout online. Ver [alcance, contrato y validación](../reports/store-sales-full-payment-20261017.md). Pendiente revisión humana y autorización de SQL/despliegue; no aplicado a Production. No iniciar fases posteriores automáticamente.


### Ventas físicas — cierre Fase 1B (2026-10-17)

Aceptación integrada en Supabase sintético local: 12/12 PASS (interfaz, sesión Auth SSR, PostgREST, RPC e inventario reales). No se cambió código funcional de Fase 1. Evidencia y alcance en [validación integrada](../reports/store-sales-integrated-validation-20261017.md). Lista para revisión de integración; SQL productivo, merge y despliegue siguen pendientes de autorización.


### Ventas físicas — preparación Fase 1C (2026-10-17)

Conclusión APTO CON CONDICIONES. Rehearsal PG17.6 sobre esquema productivo capturado + SQL01/04a, once comprobaciones de compatibilidad, locks/rollback y consultas de catálogo aprobadas. Preparados pre/postcheck y [runbook](../reports/store-sales-release-preparation-20261017.md). Se requiere lectura productiva puntual, respaldo reciente, commit revisado y corte operativo del mostrador; el formulario publicado no es plenamente compatible con la nueva RPC. Sin SQL remoto, merge o deploy.
