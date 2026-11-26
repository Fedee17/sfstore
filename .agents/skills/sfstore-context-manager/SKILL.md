---
name: sfstore-context-manager
description: Recuperar o actualizar el estado vigente de SFSTORE sin repetir investigaciones ni confundir registros fechados con producción actual. Usar antes de retomar tareas, al comparar ramas o al cerrar cambios.
---

# Contexto único y progresivo

## Fuentes, en orden
1. `AGENTS.md` y `docs/SECURITY_RULES.md`: normas; no reemplazan autorizaciones.
2. `docs/PROJECT_CONTEXT.md`: continuidad mutable. Puede estar atrasada: corroborá SHA de main, worktree, deployment y estado real cuando afecte la respuesta.
3. Sección 9 de `docs/SFSTORE-PLAN-MEJORA-CONTINUA.md`: **único backlog**. Localizá la fila de la tarea con `rg`; no leas ni recrees todo el historial.
4. `docs/SFSTORE-DIRECTRICES-MAESTRAS.md` y `docs/SFSTORE-ESTANDARES-DISENO-DESARROLLO.md`: únicamente secciones aplicables.
5. Runbook del tema (por ejemplo `docs/MERCADOPAGO-ACTIVACION.md`) solo si la tarea lo demanda.

## Reglas
- Separá: aprobado por el propietario; implementado localmente; probado; integrado a main; desplegado; activado. No son equivalentes.
- No uses evidencias antiguas para declarar credenciales, precios, stock o configuración actual.
- No repitas lecturas o pruebas ya vigentes si los archivos y el objeto de la prueba no cambiaron.
- No preguntes lo que ya se decidió; identificá solo datos realmente indispensables.
- Si hay tareas simultáneas, conservá sus ramas y cambios aislados. No hagas checkout/reset/stash encima.
- Actualizá registros vigentes *reemplazando* el estado de la tarea y citando SHA, pruebas, fecha y pendientes reales; no agregues documentos de seguimiento paralelos.
- Nunca incluyas tokens, secretos, PII innecesaria ni credenciales en la continuidad.

## Salida
Un resumen de estado de 4 elementos como máximo: base comprobada, aprobado, pendiente y próximo paso autorizado.
