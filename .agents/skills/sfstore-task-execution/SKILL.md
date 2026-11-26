---
name: sfstore-task-execution
description: Ejecutar una tarea concreta de SFSTORE de punta a punta con máxima agilidad, sin reabrir decisiones aprobadas ni pedir confirmaciones repetidas. Usar cuando se solicite implementar, corregir, integrar o avanzar una etapa.
---

# Ejecución ágil de tareas SFSTORE

## Entrada
Convertí la petición en una condición de aceptación observable en 1–3 frases. Si está aprobada, no la vuelvas a debatir. Aplicá primero `AGENTS.md` y `docs/SECURITY_RULES.md`.

## Procedimiento
1. Verificá rama, status, worktrees y la evidencia actual de `docs/PROJECT_CONTEXT.md`; revisá solo la entrada pertinente de la sección 9 de `docs/SFSTORE-PLAN-MEJORA-CONTINUA.md`. El contexto fechado no demuestra el estado presente: confirmá referencias cuando sea necesario.
2. Buscá la implementación existente y los tests relacionados con `rg`; reutilizá lógica, componentes, diseños y evidencias vigentes. No releas historia completa ni planifiques otro sistema.
3. Clasificá la operación según `docs/SECURITY_RULES.md`: autónoma, supervisada o restringida. Una autorización específica cubre solo su alcance. Cambios productivos, pagos, datos reales, secretos, merge o despliegue requieren autorización explícita. Si falta, completá lo que sea seguro y señalá exactamente el bloqueo.
4. Implementá lo mínimo necesario, en trabajo Git aislado, sin pisar cambios de otra tarea ni interferir con trabajos paralelos. Para cambios de lógica o bugs activá `sfstore-test-driven-development`; para UI aprobada `sfstore-design-implementation`.
5. Ejecutá `sfstore-quality-gate` con pruebas proporcionales al riesgo; para publicaciones expresamente autorizadas `sfstore-release`.
6. Al cerrar, actualizá la continuidad canónica y la entrada pertinente del backlog **solo en el ámbito autorizado**. No crees otro registro paralelo.

## Respuesta
Entregá resultado comprobado, evidencia breve y bloqueo/acción siguiente imprescindible; evitá informes extensos, ofrecimientos, estimaciones y preguntas ya respondidas. Si el usuario pide un prompt, entregá el prompt ejecutable inmediatamente.
