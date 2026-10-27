# SFSTORE — Continuidad actual

Actualizado: 27/10/2026 (Argentina). **Única fuente de continuidad mutable**, no nueva cola. Última evidencia conocida: revalidar lo que pueda cambiar antes de una operación sensible; este archivo no concede autorizaciones.

## Entorno y Production conocidos

| Campo | Última evidencia / regla para retomar |
|---|---|
| Repositorio | Fedee17/sfstore; dominio https://sfstore-ten.vercel.app; Vercel sfstore |
| Código productivo | `ec28135de1ffeb6e2b9516d58339659e94e5913b`; P07 publicado y verificado el 27/10 |
| Deployment | `dpl_BFAdajmHoVE29R37XQAyGWwCcCvf`, READY/Production; alias público confirmado después de promover |
| main remoto | `ec28135de1ffeb6e2b9516d58339659e94e5913b`, confirmado por `git ls-remote` después del fast-forward autorizado el 27/10; main local en otro worktree puede estar atrasado, no confundirlo con origin/main |
| Vercel | Automatic restaurado y confirmado tras recargar; cero builds pendientes al cierre del 27/10. Reconfirmar antes de publicar otro cambio |
| Supabase autorizado conocido | `xspvoicelbxlmtqoiolc` (con e después de voic); no conectar ni escribir por esta referencia |
| Datos P08 Lote 01 | Aplicado una vez y verificado en Production el 27/10: seis perfumes, 100 ml y contenido aprobado, nombre Liquid Brun corregido. No volver a ejecutar por retomar un chat; [cierre y límites](contenido/P08-PERFUMES-LOTE-01-20261027.md#cierre-de-ejecución-autorizada--27102026) |

## Trabajo actual y siguiente paso

- **P07 disponibles primero: publicado y verificado** en el SHA exacto autorizado `ec28135de1ffeb6e2b9516d58339659e94e5913b`, que integra el candidato funcional `6080b36` y la reorganización documental. Rama `codex/progressive-context-20261027`.
- Alcance: cuatro listados; disponibles → agotados, luego destacado → nombre → ID. Inicio/relacionados y contratos comerciales intactos.
- Evidencia: 38 pruebas afectadas, build, TypeScript y ESLint previos aprobados; nuevo build real READY, revisión protegida/pública móvil y notebook, filtros, agotados, familia sin selección automática, ambos combos y Consultar precio. Carrito/checkout: Gris + combo C/C = $58.000 por transferencia; sin pedidos ni formularios enviados; carrito local vaciado. [Cierre en sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#p07--disponibles-primero-publicación-controlada-del-27102026).
- **Bloqueos del corte:** ninguno. Automatic restaurado; un registro automático CANCELED fue el resultado esperado del bloqueo, sin reemplazar el dominio.
- **Próximo paso:** esperar el siguiente encargo desde la sección 9; decants y orden por precio siguen pendientes por separado. No publicar automáticamente.
- **Seguimiento:** cierre documental posterior separado localmente, sin push ni deployment adicional. `985975f` y `078bb0d` ya integrados en main/Production mediante la cadena autorizada. `071633e` excluido.

## Cómo retomar sin confundir checkouts

Worktree usado: `C:/dev/sfstore/.worktrees/p03-family-presentation-20261025` (el nombre de carpeta es histórico). Abrir la conversación sobre ese directorio y leer su AGENTS. `C:/dev/sfstore` está en una rama antigua: no representa el candidato actual. Comprobar `Get-Location`, `git status --short`, `git branch --show-current`, `git log -1` y `git worktree list` antes de actuar; no cambiar ramas automáticamente para hacer coincidir este texto.

La reorganización documental ya está integrada en main mediante ec28135. El cierre posterior de publicación permanece local hasta integración autorizada; otros worktrees pueden tener copias anteriores. No copiar informes completos al nuevo chat: indicar directorio y tarea.

## Fuentes por necesidad

- **Cola/estado de tareas:** [Plan, sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#9-diagnóstico-consolidado-y-cola-única--actualización-del-25102026); fila y último cierre del ID. Auditorías citadas sólo si falta evidencia, no como lectura inicial.
- **Diseño/UX/contenido:** [Directrices](SFSTORE-DIRECTRICES-MAESTRAS.md) y [Estándares](SFSTORE-ESTANDARES-DISENO-DESARROLLO.md): índices + secciones del flujo afectado y aceptación. Sin contenido o características inventadas.
- **Seguridad y tests:** [reglas permanentes/método](SECURITY_RULES.md); antecedentes sólo del área afectada.
- **Publicación/rollback:** [checklist vigente](production-checklist.md#reglas-vigentes-de-integración-y-publicación) y runbook aprobado del candidato; consultar artefactos privados sólo al ejecutar su tarea autorizada, sin versionar secretos/dumps.
- **Arquitectura y negocio:** [ARCHITECTURE](ARCHITECTURE.md), [BUSINESS_RULES](BUSINESS_RULES.md), [catálogo](catalog-data-model.md), [Sheets](google-sheets-product-sync.md); son referencias de sus fechas, contrastar con código actual. No recorrerlos completos por defecto.
- **Originales conservados:** [PROJECT_CONTEXT del 10/10](PROJECT_CONTEXT-HISTORICO-20261010.md), [AGENTS anterior](AGENTS-HISTORICO-20261027.md), [backlog histórico](DEVELOPMENT_BACKLOG.md). No son una segunda cola ni autorizaciones actuales.

## Mantenimiento de este estado

Después de cada avance, actualizar los campos anteriores (sin acumular diarios aquí), fecha, rama/candidato, estado productivo sólo con evidencia, bloqueos, autorización con alcance y próximo paso. Registrar detalles/resultados/historial en la tarea de la sección 9 o su fuente original y enlazarlos. Si se contradicen el archivo y Git/entorno, detener la acción sensible y resolver por evidencia; nunca descartar cambios para adaptar la realidad al resumen. No guardar contraseñas, tokens, correos de clientes, dumps ni costos privados en este estado.
