# SFSTORE — Continuidad actual

Actualizado: 27/10/2026 (Argentina). **Única fuente de continuidad mutable**, no nueva cola. Última evidencia conocida: revalidar lo que pueda cambiar antes de una operación sensible; este archivo no concede autorizaciones.

## Entorno y Production conocidos

| Campo | Última evidencia / regla para retomar |
|---|---|
| Repositorio | Fedee17/sfstore; dominio https://sfstore-ten.vercel.app; Vercel sfstore |
| Código productivo | `d77e714ea89440e606222c82ac464ce098e6659b`; último cierre P05/EXT-C1 verificado el 27/10 |
| Deployment | `dpl_E98zh2Ew6XXFLd6M3kSnRgnrVBx1`, según ese cierre; no se volvió a consultar Vercel durante la compactación documental |
| main remoto | `d77e714ea89440e606222c82ac464ce098e6659b`, confirmado por `git ls-remote` el 27/10; main local en otro worktree puede estar atrasado, no confundirlo con origin/main |
| Vercel | Último cierre: Automatic y cero builds pendientes. No es una lectura en vivo; reconfirmar antes de publicar |
| Supabase autorizado conocido | `xspvoicelbxlmtqoiolc` (con e después de voic); no conectar ni escribir por esta referencia |
| Datos P08 Lote 01 | Aplicado una vez y verificado en Production el 27/10: seis perfumes, 100 ml y contenido aprobado, nombre Liquid Brun corregido. No volver a ejecutar por retomar un chat; [cierre y límites](contenido/P08-PERFUMES-LOTE-01-20261027.md#cierre-de-ejecución-autorizada--27102026) |

## Trabajo actual y siguiente paso

- **P07 disponibles primero:** implementado y validado, **no publicado**. Rama `codex/p07-available-first-20261027`, candidato `6080b36f9180092e8cb6c47b9c0afc185956c494`.
- Alcance aprobado local: Perfumes, Mates, Accesorios y búsqueda; disponibles → agotados, luego destacado → nombre → ID. Familias/combos con disponibilidad existente; sin textos/controles nuevos. Inicio/relacionados, precios, stock y checkout intactos.
- Evidencia vigente: 38 pruebas afectadas, build, TypeScript, ESLint y navegador sintético 390×844/1366×900 aprobados; [detalle en sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#p07--disponibles-primero-implementación-local-del-27102026). No repetir salvo cambio/fallo/evidencia dudosa.
- **Bloqueo:** falta autorización de publicación P07. No hay autorización de push, merge, Vercel o deploy en el encargo actual. Sin bloqueo técnico conocido; el incidente de Windows fue resuelto por el propietario, no volver a tratarlo como restricción vigente.
- **Próximo paso:** al encargo del propietario, preparar publicación controlada de P07 o continuar la tarea que indique desde la sección 9; no elegir otro trabajo ni publicar automáticamente.
- Última entrega: compactación documental local. Rama `codex/progressive-context-20261027`, basada en P07; su diff respecto de `6080b36` debe ser exclusivamente documental. P07 conserva su rama/candidato separados.
- Commits documentales previos separados: `985975f` (cierre P05) y `078bb0d` (P08 Lote 01). No se publicaron. No incorporar `071633e` ni otras ramas por proximidad histórica.

## Cómo retomar sin confundir checkouts

Worktree usado: `C:/dev/sfstore/.worktrees/p03-family-presentation-20261025` (el nombre de carpeta es histórico). Abrir la conversación sobre ese directorio y leer su AGENTS. `C:/dev/sfstore` está en una rama antigua: no representa el candidato actual. Comprobar `Get-Location`, `git status --short`, `git branch --show-current`, `git log -1` y `git worktree list` antes de actuar; no cambiar ramas automáticamente para hacer coincidir este texto.

Los cambios de contexto sólo están en la rama documental local hasta integración autorizada: una conversación abierta en main u otro worktree no recibirá por sí sola este AGENTS. No copiar informes completos al nuevo chat: indicar directorio y tarea.

## Fuentes por necesidad

- **Cola/estado de tareas:** [Plan, sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#9-diagnóstico-consolidado-y-cola-única--actualización-del-25102026); fila y último cierre del ID. Auditorías citadas sólo si falta evidencia, no como lectura inicial.
- **Diseño/UX/contenido:** [Directrices](SFSTORE-DIRECTRICES-MAESTRAS.md) y [Estándares](SFSTORE-ESTANDARES-DISENO-DESARROLLO.md): índices + secciones del flujo afectado y aceptación. Sin contenido o características inventadas.
- **Seguridad y tests:** [reglas permanentes/método](SECURITY_RULES.md); antecedentes sólo del área afectada.
- **Publicación/rollback:** [checklist vigente](production-checklist.md#reglas-vigentes-de-integración-y-publicación) y runbook aprobado del candidato; consultar artefactos privados sólo al ejecutar su tarea autorizada, sin versionar secretos/dumps.
- **Arquitectura y negocio:** [ARCHITECTURE](ARCHITECTURE.md), [BUSINESS_RULES](BUSINESS_RULES.md), [catálogo](catalog-data-model.md), [Sheets](google-sheets-product-sync.md); son referencias de sus fechas, contrastar con código actual. No recorrerlos completos por defecto.
- **Originales conservados:** [PROJECT_CONTEXT del 10/10](PROJECT_CONTEXT-HISTORICO-20261010.md), [AGENTS anterior](AGENTS-HISTORICO-20261027.md), [backlog histórico](DEVELOPMENT_BACKLOG.md). No son una segunda cola ni autorizaciones actuales.

## Mantenimiento de este estado

Después de cada avance, actualizar los campos anteriores (sin acumular diarios aquí), fecha, rama/candidato, estado productivo sólo con evidencia, bloqueos, autorización con alcance y próximo paso. Registrar detalles/resultados/historial en la tarea de la sección 9 o su fuente original y enlazarlos. Si se contradicen el archivo y Git/entorno, detener la acción sensible y resolver por evidencia; nunca descartar cambios para adaptar la realidad al resumen. No guardar contraseñas, tokens, correos de clientes, dumps ni costos privados en este estado.
