---
name: sfstore-release
description: Integrar y publicar cambios aprobados de SFSTORE en GitHub/Vercel de forma segura, conservando main y operaciones productivas. Usar solo cuando haya autorización explícita de commit, PR, merge o despliegue para ese alcance.
---

# Publicación controlada SFSTORE

## Precondición
Leer `docs/production-checklist.md#reglas-vigentes-de-integración-y-publicación` y `docs/SECURITY_RULES.md`. **No inferir** autorización productiva de un prototipo aprobado, de un commit ni de la mera existencia de esta skill.

## Pasos
1. Comprobar SHA actual de `origin/main`, SHA en Production, últimas integraciones, builds pendientes y cambios de otros agentes. No confiar en continuidad fechada sin contrastar.
2. Revisar branch aislada y diff concreto; conservar trabajos simultáneos (especialmente Mercado Pago). No ejecutar reset, force, stash o checkout sobre modificaciones ajenas.
3. Ejecutar `sfstore-quality-gate` y resolver bloqueos relevantes. Verificar CI y preview de Vercel.
4. Preparar PR acotado. Si hay migraciones/secretos/infra/activación, requerir autorización específica y aplicar runbook correspondiente. Una migración con rollback no necesariamente es solo lectura.
5. Comprobar disparadores Git/Vercel antes de merge. Documentación también puede disparar despliegues. Publicar/promover **solo** si el usuario autorizó explícitamente la acción y el mecanismo seguro está comprobado.
6. Verificar deployment por SHA y URL después de publicar, rutas pertinentes y que datos comerciales permanezcan intactos. No crear pedidos reales ni consumir cobros como smoke test.
7. Registrar el estado real en `docs/PROJECT_CONTEXT.md` y la sección 9, sin duplicar backlogs, y cerrar brevemente con SHA, PR, despliegue y verificaciones.

## Parada segura
Ante mismatch de SHA, credenciales dudosas, fallos críticos, cambios productivos no cubiertos o efectos inciertos: detener *solo* la operación afectada. Nunca activar pagos porque el código ya esté publicado.
