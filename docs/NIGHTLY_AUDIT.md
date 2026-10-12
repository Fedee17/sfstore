# SFSTORE — auditoría nocturna y ClickUp

Estado: Fases A/B implementadas; cliente de C preparado y validado con API simulada; D preparado; E desactivada. Rama independiente `codex/nightly-audit-clickup`, basada en el checkout de integración f137829. No modifica main, PR #2 ni servicios. Sin push, tareas ClickUp reales o ejecuciones Actions.

## Arquitectura y horario

GitHub-hosted Ubuntu 24.04 + Node 24; no requiere la computadora del propietario. Dos workflows con workflow_dispatch solamente. Los fragmentos de schedule están fuera de .github/workflows, en audit/nightly/schedule.disabled.yml; no se registran horarios reales.

| Hora argentina | UTC | Bloque |
| --- | --- | --- |
| 01:17 | 04:17 | npm audit, Gitleaks, Semgrep |
| 03:17 | 06:17 | build, TypeScript, ESLint, tests sintéticos |
| 05:17 | 08:17 | fronteras del checkout, pagos, descuentos, inventario y permisos |
| 08:00 | 11:00 | informe y eventual sincronización de hallazgos |

Conversión UTC-03 de America/Argentina/Buenos_Aires; día calculado con Intl y zona IANA. Revalidar conversión si cambian reglas horarias. GitHub también soporta timezone IANA en schedule; se usa UTC explícito para claridad y portabilidad. GitHub puede retrasar o perder eventos: las 08:00 son el horario objetivo, no un SLA. Falta de bloques, timeouts, herramientas/JSON inválidos o commits distintos quedan visibles. Un error de instalación puede impedir todo resultado; el consolidador muestra cobertura ausente o falla sin afirmar éxito.

Una única ejecución por rama se serializa con concurrency; cancel-in-progress:false. Un rerun posterior sigue permitido y sustituye la evidencia anterior, no duplica hallazgos. Informe/ClickUp se serializan globalmente. Timeout 35 minutos por recolector, 10 por informe, 5 por ClickUp. Cada comando tiene timeout y presupuesto de salida; Linux mata el grupo de procesos. Sin polling, dispatches recursivos, fixes, push, merges o deploys.

## Código aprobado y desarrollo

La fuente inicial aprobada es main. El controlador y los secretos deben proceder de un workflow revisado en la rama predeterminada. Los schedules sólo se registran allí. El recolector resuelve una rama allowlisted a un SHA y hace checkout exacto, sin persistir credenciales.

No activar esta rama como código aprobado: depende de funcionalidades aún en PR #2. Cuando se integre la base comercial por un proceso autorizado independiente, main tendrá las pruebas correspondientes. Si faltan, checkout se informa incompleto, no como aprobado.

audit/nightly/config.json contiene approvedRef y developmentRefs (lista vacía). Para diagnosticar desarrollo, aprobar expresamente una rama propia, añadir su nombre exacto y ejecutar manualmente audit_ref. Nunca aceptar forks ni ejecutar código de PR con pull_request_target. Mantener grupos e IDs separados por rama. No basta un nombre codex/* para considerar confiable su código.

Los bloques programados iniciales sólo auditan main. Si se habilita un desarrollo nocturno adicional, agregar sus dispatches al plan en un cambio revisado; no se multiplican jobs automáticamente. Si cambia un SHA entre bloques, el informe puede listar hallazgos de esos SHAs pero no inferir resolución. El estado de findings se separa por scope/rama.

## Controles y clasificación

- **Estáticos**: npm audit --json (advisories reproducibles, sin afirmar exploitabilidad), Gitleaks sobre historial de Git, Semgrep local con reglas acotadas, TypeScript, ESLint. Reglas de ejemplo: exposición de service_role por NEXT_PUBLIC, eval dinámico y URLs públicas para comprobantes. No constituyen una auditoría de seguridad completa.
- **Sintéticos**: compilación y tests existentes con mocks/fronteras HTTP/renderizado, reglas de descuento, pago completo, stock y autorización. Allowlist específica para checkout y suite general filtrada. npm ci --ignore-scripts; no npm audit fix ni scripts de instalación del proyecto.
- **Reales**: no se consultan. No se proporcionan Supabase/MP/Vercel keys; se eliminan env de credenciales y flags de runners reales antes de cada comando. No se habilitan suites PostgreSQL, Supabase ni pruebas destructivas. No se ejecutan migraciones, tampoco locales/efímeras.
- **Calidad/accesibilidad**: ESLint y las reglas jsx-a11y que ya suministre la configuración. Advertencias no crean tareas. No hay axe, auditoría visual o navegador de accesibilidad completo; esos controles son pendientes. Permisos efectivos de DB y RLS productivo no se prueban con análisis estático.

El runner rechaza un target con .env.local/.env.production. Checkout limpio e instalación no usan secrets. No sube stdout/stderr, source snippets o reporte privado de Gitleaks; sólo normaliza regla/archivo/línea y comando/exit. Las fallas de build/tests se reproducen por SHA+comando; para diagnóstico detallado, un humano ejecuta la prueba localmente. Los JSON/Markdown son datos, nunca instrucciones para Codex ni código ejecutable.

## Informe y comparación

Artifacts pequeños con results.json por bloque y report.json/report.md diario; retención 14 días y GitHub Step Summary. Disponibles por la URL de Actions para descarga/revisión en Codex, sin commits diarios ni mensajes automáticos. scripts/nightly/github.mjs usa API oficial GET, páginas acotadas y cero polling. Consulta runs del día, artifacts de hasta 12 runs y hasta 10 reportes anteriores para encontrar el mismo scope. El límite de páginas falla cerrado, no deduplica con inventario truncado.

Se identifica cada hallazgo con SFNA-<hash de rama/control/regla/componente>, estable ante cambios de línea, fecha o run. Nuevos, persistentes, resueltos y sin nueva verificación. Sólo se resuelve si el control se ejecutó completamente y los bloques comparten un SHA. Sin baseline retenida se considera nuevo; ClickUp aún deduplica por ID. Si el primer informe o la evidencia expiran, no se inventan resoluciones. Tres prioridades por severidad y riesgo comercial/seguridad, agrupadas por componente para no repetir tres advisories del mismo paquete.

Los artefactos ZIP se leen con unzip -p para un miembro fijo, sin extraer paths. Se valida provenance del run; tamaño máximo 5 MB. Authorization de GitHub no se reenvía al host de descarga firmado. Para una futura ampliación de hosts oficiales, revisar explícitamente allowlist.

## ClickUp: preparada, sin conexión real

API oficial v2: GET /list/{list_id}/task (include_closed=true, paginado), POST /list/{list_id}/task y PUT /task/{task_id}. Credencial únicamente en header Authorization; URL base fija, redirects rechazados, timeout 15 segundos, error sin body/token.

Hallazgo incluye ID, título, categoría, severidad, componente, evidencia, impacto, sugerencia, detección y enlace Actions. Marca SFSTORE-AUDIT-ID en descripción. Lista dedicada, sin modificar tareas ajenas. Descarga inventario una vez; no una búsqueda por hallazgo. Reutiliza IDs, no actualiza si contenido idéntico y aborta si detecta dos tareas con la misma marca. Sólo severidades media/alta/crítica con evidencia y run válidos; warnings no son elegibles.

Dry-run no consulta ClickUp ni requiere token. Sync real requiere simultáneamente:
1. config.clickup.enabled=true (actualmente false).
2. CLICKUP_SYNC_ENABLED y CLICKUP_ACTIVATION_APPROVED=true (GitHub Variables).
3. GITHUB_ACTIONS=true, informe completo y coherente.
4. Job en rama predeterminada, environment nightly-audit-clickup y aceptación de su protección.
5. Solicitud manual sync_clickup=true, o schedule futuro autorizado.
6. CLICKUP_API_TOKEN y CLICKUP_LIST_ID en Secrets del environment, nunca .env/config.

Máximo 30 cambios por corrida; 650 ms entre escrituras (~92/min) y reintentos acotados para 429/lecturas/PUT. Respeta X-RateLimit-Reset hasta 60 s. Un POST ambiguo por timeout/5xx no se reintenta ciegamente: falla y requiere reconciliación humana antes de reactivar el writer. ClickUp no documenta una clave de idempotencia para Create Task; listado/marker + serialización deduplican reintentos normales pero no garantizan exactly-once ante consistencia eventual o writers externos. No activar otro writer para la misma lista.

Un hallazgo resuelto actualiza la descripción, sin forzar status/cerrar tareas ni sobrescribir decisiones de un humano. No utiliza campos personalizados pagos ni consume usos de Custom Fields. Corroborar permisos/plan del usuario técnico y crear una cuenta con acceso únicamente a la lista dedicada; los tokens personales heredan permisos del usuario, no asumir scopes granulares inexistentes.

## Permisos, costos y requisitos

GITHUB_TOKEN: contents:read; informe agrega actions:read para artifacts/runs. Sin issues:write, contents:write, pull-requests:write, deployments o id-token. Upload-artifact usa el mecanismo de artifacts de Actions. Actions oficiales fijadas por SHA. Environment restringido a la rama predeterminada con reviewer obligatorio y prevención de autoaprobación, si el plan lo permite. Nunca exponer secrets al job que ejecuta tests del target.

Estimación inicial de diseño, pendiente medir en runners: 15–30 minutos Linux por noche (450–900/mes por rama); instalar Semgrep domina arranque. Saltar npm ci en fase security; npm audit usa lockfile. Sin contenedores Supabase, matrices amplias, LLM o loops de API. Un desarrollo adicional aumenta el costo proporcionalmente. Máximo de timeout es más alto que la estimación; configurar presupuesto/límite de gasto de Actions.

Según tarifas oficiales consultadas el 2026-10-12: runner Linux estándar 2-core USD 0.006/min; 450–900 minutos totalmente facturados equivaldrían a USD 2.70–5.40/mes, antes de cuota incluida, impuestos y almacenamiento. GitHub Free incluye 2000 minutos y 500 MB para privados; otras automatizaciones comparten consumo. Runners estándar públicos son gratuitos; no se comprobó plan/visibilidad/cuota de esta cuenta. La cuenta debe verificar Billing antes de activar. Artifacts objetivo <1 MB/noche con 14 días: <14 MB, sin subir caches/build/logs privados. ClickUp cobra según su plan; confirmar acceso API, hoy no se contrataron servicios.

Herramientas fijadas: Node 24, Semgrep 1.99.0, Gitleaks 8.30.1 (checksum oficial verificado antes de extracción). Versiones deben revisarse periódicamente; no autoactualizar herramientas. Primer dry-run hospedado debe confirmar compatibilidad Linux, descarga de artifacts y formato real de APIs; prueba local no certifica GitHub Actions.

## Activación futura (Fase E requiere autorización explícita)

1. Revisar esta rama y sus permisos; publicar/abrir PR sólo con autorización independiente. No actualizar PR #2.
2. Integrar workflows manuales en la rama predeterminada mediante revisión aprobada, coordinando que esa integración no despliegue cambios automáticamente. No se modifica main en esta tarea.
3. Ejecutar workflow_dispatch phase=all sobre SHA aprobado sin secrets; descargar informe. Luego probar fases separadas/reintentos y día siguiente. Corregir gaps; no habilitar servicios reales.
4. Configurar entorno protegido y Secrets de ClickUp. Probar inventario y deduplicación en lista de prueba con autorización expresa antes de crear cualquier tarea.
5. Obtener autorización concreta para horarios y escrituras; entonces insertar sólo los fragments schedule correspondientes. Habilitar ClickUp por separado (no necesario para comenzar reportes).
6. Observar primeras noches, retrasos, consumo, cobertura y deduplicación; configurar monitor independiente de ausencia de informe si se exige SLA. Desactivar schedule o el workflow ante problemas; para ClickUp apagar Variables y config.
7. Codex consulta report.md, valida los tres candidatos y corrige sólo en un nuevo encargo/rama. La auditoría nunca corrige ni integra código automáticamente.

## Fuentes oficiales

- [GitHub: eventos programados, rama predeterminada y retrasos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- [GitHub: costos y cuotas](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- [ClickUp: autenticación](https://developer.clickup.com/docs/authentication).
- [ClickUp: Get Tasks](https://developer.clickup.com/reference/gettasks), [Create Task](https://developer.clickup.com/reference/createtask), [Update Task](https://developer.clickup.com/reference/updatetask).
- [ClickUp: rate limits](https://developer.clickup.com/docs/rate-limits).

## Evidencia local de implementación

25 pruebas del mecanismo: IDs/días, sanitización, entorno aislado, timeout, comparación/coverage/SHAs, priorización, ClickUp create/update/retry/paginación/429, POST ambiguo y gates, provenance/presupuestos, YAML/manual-only/pinning/permisos y artefactos. Suite general: 678 aprobadas, 0 fallidas; 7 pruebas y 6 suites optativas omitidas. Esos skips no cuentan como pases ni consultas reales.

Runner checkout ejecutado sobre copia limpia de archivos versionados de f137829: 113 pruebas sintéticas aprobadas, 0 fallidas/omitidas; 0 hallazgos. Sin entorno local copiado ni conexión a Supabase. El baseline implementado está en PR #2 aún pendiente; se registra su SHA para no atribuir ese resultado a main.

Validación hospedada de GitHub, integración con ClickUp real y todas las activaciones quedan pendientes.

Ensayo adicional del runner quality sobre la copia limpia: build, TypeScript y ESLint aprobados; 644 tests seleccionados aprobados sin skips. npm audit real al registro informó 30 asociaciones paquete/advisory, incluyendo avisos críticos; se clasifican como análisis de dependencias, no exploits verificados. Semgrep no está instalado localmente. La copia de archivos no tiene metadata Git: el runner no considera verificado su historial ni escanea implícitamente un repositorio padre. Gitleaks independiente sobre todas las fuentes nuevas: sin hallazgos. El informe de muestra queda en staging/runtime/nightly-daily-preview/report.md, ignorado por Git, con cobertura incompleta y sin enlaces Actions ficticios.

## Preparación para publicación sobre PR #5

Se preservó la implementación original mediante commit local y rebase sobre `d3ed42484622896e56dfb76667b1acf6e1846ec6`, cabeza actualizada de PR #5. Las mejoras de PR #2 (checkout/pagos/reservas), PR #3 (Next/PostCSS/nanoid), PR #4 (SheetJS oficial) y PR #5 (Turnstile administrativo) permanecen sin cambios en sus fuentes, SQL y dependencias.

Se agregó el login CAPTCHA a las regresiones del bloque checkout. Se reforzó la prohibición de ejecutar código con cualquier variante Next de archivo `.env` y se valida el host/ruta/ID del archivo GitHub antes de enviar Authorization. `vercel.json` deshabilita despliegues de `codex/nightly-audit-clickup`. El CI de PR valida esta rama sin ejecutar los workflows nocturnos ni conectar ClickUp.

### Secrets y permisos necesarios, sin configurar ni activar todavía

En el environment protegido `nightly-audit-clickup`, preparar únicamente después de autorización:

| GitHub Actions Secret | Valor/configuración futura |
| --- | --- |
| `CLICKUP_API_TOKEN` | Token de una identidad técnica con acceso mínimo a la lista dedicada; no incluirlo en repositorio, `.env`, informes o logs. |
| `CLICKUP_LIST_ID` | `901717762349`, identificador proporcionado por el propietario; acceso y pertenencia no verificados contra la API real. |

No se necesitan secretos Supabase, Vercel, Turnstile ni Mercado Pago. `GITHUB_TOKEN` es el token automático de Actions, con `contents:read` y, sólo para recolectar artifacts, `actions:read`. Las Variables `CLICKUP_SYNC_ENABLED` y `CLICKUP_ACTIVATION_APPROVED` deben permanecer ausentes/false. `audit/nightly/config.json` conserva `clickup.enabled=false`, `approvedRef=main` y `developmentRefs=[]`: auditar una rama de desarrollo requiere una allowlist revisada, no basta con publicar esta rama.

Los permisos efectivos del token ClickUp dependen del usuario/Workspace; este código necesita lectura de tareas de esa lista, creación y edición de sus propias tareas de auditoría. No necesita borrar, cerrar tareas, administrar el Workspace ni Custom Fields. Usar environment con revisión humana obligatoria, restricción a rama predeterminada y prevención de autoaprobación cuando el plan lo permita. Inventario, identidad, permisos y deduplicación con API real siguen pendientes y requieren autorización separada.

Los dos workflows nocturnos contienen únicamente `workflow_dispatch`; no contienen `schedule`, `push`, `pull_request_target` ni despliegues. Los cron 01:17/03:17/05:17 y reporte 08:00 Buenos Aires permanecen como fragmentos no ejecutables fuera de `.github/workflows`. La generación del informe y las pruebas del cliente son locales/sintéticas; no se crearon tareas reales ni se guardaron Secrets en GitHub.

La exposición de los workflows manuales en la rama predeterminada, prueba hospedada de recolección/artifacts/días sucesivos, configuración del environment y futura activación de horarios/ClickUp son pasos separados. La publicación de una PR en borrador no los activa. La ventana horaria de GitHub no garantiza puntualidad; una falta de cobertura o mezcla de SHAs se presenta como incompleta y no resuelve hallazgos.

### Evidencia de esta revisión

Pruebas del sistema: 27/27 aprobadas. Instalación limpia y 693/693 regresiones sintéticas aprobadas en una copia de fuentes sin `.env`. El propio ejecutor de auditoría verificó build Next 16.3.8, TypeScript, ESLint, 693 tests generales y 129 tests del bloque checkout, todos completos y aprobados. Generó report.json/report.md, marcó correctamente la falta del bloque security en ese ensayo parcial y ejecutó ClickUp dry-run sin red ni tareas. Gitleaks sobre archivos completos e historial propio aprobó sin secretos. No se publica ese output local ni el triage histórico ajeno que sigue preservado sin versionar.

Se preparó en el CI de esta PR un smoke adicional de scanners estáticos (npm audit, Semgrep/Gitleaks fijados) y reporte parcial normalizado. Un advisory es un hallazgo estático, no un fracaso del mecanismo ni prueba de explotación. El job falla si la herramienta no produce cobertura completa. No tiene Secrets ClickUp, no ejecuta workflows nocturnos, horarios, SQL ni servicios reales. El resultado remoto se registra en la descripción de la PR. La recolección real entre los dos workflows manuales y artifacts de días sucesivos sigue pendiente, ya que no se modifica la rama predeterminada en este encargo.

El primer smoke Linux aprobó las herramientas pero detectó una omisión de alcance: NODE_ENV=production hacía que npm audit omitiera devDependencies. Se corrigió con --include=dev y una prueba que verifica los argumentos reales del ejecutor aislado. La suite del mecanismo quedó en 28/28; la validación final de la revisión se registra en la PR. No se interpreta la desaparición de advisories por omisión como una resolución.
