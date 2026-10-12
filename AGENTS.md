<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# SFSTORE — Desarrollo semiautónomo controlado

Leer primero [contexto](docs/PROJECT_CONTEXT.md), [seguridad](docs/SECURITY_RULES.md) y la tarea seleccionada de [backlog](docs/DEVELOPMENT_BACKLOG.md). La evidencia inicial y validaciones están en [auditoría](docs/PROJECT_AUDIT_2026-10-10.md). Los documentos técnicos describen main; consultar PRs pendientes antes de duplicar trabajo.

## Alcance y autonomía

El backlog propone trabajo; no concede autorización para iniciarlo. Durante la preparación del 2026-10-10: únicamente auditoría/documentación, sin funcionalidades, commits, push, merge, deploy ni ejecución del backlog.

| Nivel | Cuándo aplica | Regla |
| --- | --- | --- |
| AUTÓNOMA | Cambio rutinario, pequeño, reversible, probado y sin alterar negocio/seguridad crítica/datos reales. | Ejecutar dentro del alcance delegado; rama aislada y diff verificable. |
| SUPERVISADA | Funcionalidad nueva, UI significativa, arquitectura o comportamiento comercial. | Puede desarrollarse en rama independiente cuando el alcance esté encargado; revisión humana antes de integrar. |
| RESTRINGIDA | Production, datos/precios/stock reales, pagos, secretos, destructivos o seguridad crítica. | Aprobación explícita antes de ejecutar la tarea/acción concreta. Preparación read-only según alcance autorizado. |

Clasificar por el mayor riesgo de cualquiera de sus efectos. Tests sintéticos o una rama independiente no convierten un cambio crítico de pagos/RLS en autónomo. No pedir aprobación para lecturas locales o cambios reversibles ya autorizados; no inferir autorización de publicación o Production de una tarea de implementación.

## Git, entornos y eficiencia

1. Comprobar branch/status/worktrees y preservar cambios propios/ajenos; no reset, stash, checkout encima ni modificar main. Trabajar en rama/worktree aislado, sin mezclar objetivos.
2. Buscar primero archivos relevantes con rg; reutilizar evidencia vigente. Investigar un área completa solo cuando sea necesario; agrupar cambios relacionados.
3. Si la configuración permite elegir modelo, usar el de menor costo suficiente para la complejidad/riesgo; escalar con evidencia. No declarar un cambio de modelo que no se pudo configurar. No crear agentes ni procesos recurrentes por defecto.
4. Limitar a dos intentos razonables de corrección por un mismo fallo sin nueva evidencia. Entonces registrar causa, intentos y acción exacta necesaria; no repetir comandos ciegamente ni cambiar configuración para ocultar fallos.
5. Evitar refactors generales y cambios a comportamiento estable sin necesidad y alcance. Registrar decisiones relevantes en docs/reporte de la tarea (motivo, evidencia, tradeoff, validación).
6. No usar credenciales productivas en tests; fixtures sintéticos, servicios mock o DB local efímera. No ejecutar limpiadores Storage, migrations remotas, supabase db push ni tocar datos reales sin autorización específica.
7. Confirmar autorización para commit/push según la tarea; integrar supervisadas solo con revisión. Verificar relación branch/deploy antes de publicar. Nunca desplegar implícitamente ni enviar comunicaciones externas sin encargo.

## Validación

Instalación reproducible: `npm ci`. Test runner actual: `node --test tests/*.test.mjs`; no hay `npm test` en main. Empezar por tests de archivos afectados y ampliar a suite general cuando el cambio lo requiera. TypeScript: `npx tsc --noEmit`; ESLint: `npm run lint`; build: `npm run build`; dependencias: `npm ls --all --json`, `npm audit --json`. Revisar exit codes y skips; build no prueba Supabase/Mercado Pago. Ejecutar tsc después de build si depende de tipos generados; evitar ambos mutando/leyendo `.next` simultáneamente.

Los tests opcionales requieren `SFSTORE_TEST_PG_BIN` + `SFSTORE_TEST_PG_MODULE` y `SFSTORE_TEST_PLAYWRIGHT_MODULE`: ver reporte para el runtime usado. Registrar si faltan y si se omiten; no atribuir un skip a un pase. No modificar package.json para silenciar warnings o desactivar reglas/pruebas. Conservar diferencias entre baseline de main y correcciones pendientes en PRs.

## Entrega

Informar objetivo, archivos/diff, verificaciones/resultados, riesgos, decisiones pendientes y estado de integración. No afirmar Production verificada desde código local. Actualizar documentación/backlog al completar una tarea autorizada; no avanzar al siguiente objetivo automáticamente.

## Fase 2 autorizada

El pedido posterior autoriza revisar/confirmar la documentación inicial y ejecutar hasta tres tareas AUTÓNOMAS de bajo riesgo en ramas independientes. Pueden crearse commits locales verificados. No autoriza push, merge, despliegues, migrations, cambios de pagos/datos reales ni tareas SUPERVISADAS/RESTRINGIDAS. El análisis read-only de las entradas de npm audit está autorizado; aplicar solo correcciones compatibles de bajo riesgo sin conflicto con PR #1. Detener una tarea tras dos intentos razonables sin solución y registrar el bloqueo.


## Fase 3 — propuesta de integración

Pedido autoriza revisión de PR #1, worktree de combinación y commits locales completamente validados. Baseline candidato `codex/integration-storage-phase2` en `531d411`; requisitos en reports/integration-baseline-phase3-20261010.md. No se permite push, merge a main, deploy ni migrations reales; no implementar QA-01 en esta fase. Un baseline aceptado para desarrollo local no autoriza operaciones de Production.
