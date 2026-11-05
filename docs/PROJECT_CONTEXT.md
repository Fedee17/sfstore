# SFSTORE — Continuidad actual

Actualizado: 05/11/2026 (Argentina). Única continuidad mutable; la única cola es la sección 9 del Plan. Este archivo no concede autorizaciones.

## Entorno y Production conocidos

- Repositorio Fedee17/sfstore; dominio https://sfstore-ten.vercel.app.
- Base verificada antes de publicar el carrusel: main local y origin/main en b500a64561d3bc07c17f13f633c8e0d8d535fcb7.
- Deployment público verificado antes del cambio: dpl_AC6tv9QV2KaxtDuWJwpth1V6yKXP, READY/Production, commit b500a64. Punto de recuperación para el carrusel.
- Vercel sfstore: prj_XSoey2X2Oyqr8O5rBT8FBidxMrKV, equipo team_tab21Li6WWDl2lVutglfhidX. Rama de Production main, despliegues Git habilitados y sin comando para ignorar builds. Sin despliegues pendientes en la comprobación previa.
- Supabase xspvoicelbxlmtqoiolc: lotes de contenido 01/02/03 y migración de privacidad aplicados y verificados; cierres/hashes en sección 9. No repetir operaciones.
- Lote de 25 precios de perfumes aplicado y verificado: especial techo a $1.000 de costo ×1,40 y lista compatible con transferencia 25%; otros 54 registros preservados.
- Cinco perfumes publicados y verificados: Rome Pour Femme, 9AM Pour Femme, Maleka, Club de Nuit Woman y Hawas Malibú, con fichas y fotografías aprobadas.
- Fotografías completadas el 01/11: 51 restantes asociadas a 37 productos; 75 imágenes finales, incluidas 24 anteriores preservadas (cinco de la fase previa). Tres tomas redundantes no se volvieron a cargar. 75 URLs HTTP200 y hashes nuevos comprobados; sin borrados.
- Presentaciones incorporadas sólo a las descripciones aprobadas: Iconic 105 ml; Intense Man EDT 105 ml; Stallion 53 100 ml + atomizador 20 ml. Otros datos comerciales/atributos intactos.

## Trabajo actual y siguiente paso

- Encargo vigente P07: aplicar a la portada el mockup «LOS MÁS ELEGIDOS DE SF STORE». Rama y worktree codex/home-most-chosen-20261105, base b500a64. Main local y origin/main registrado coinciden en b500a64.
- Candidato local: hasta seis destacados elegibles, ordenados por el precio especial que muestra la tarjeta, con tres visibles en escritorio y dos en celular. Avance automático de a uno cada 8 segundos y flechas laterales. El foco o un toque detienen la rotación y la preferencia de movimiento reducido muestra la selección estática. Las flechas quedan fuera de las tarjetas en 1366 px. En móvil, la fila avanza automáticamente y también admite deslizamiento táctil, con encaje por tarjeta. Las flechas quedan en escritorio.
- Validado con build estándar Turbopack, TypeScript, 30 pruebas de inicio y precios, ESLint sin errores con dos avisos de img preexistentes y Playwright con catálogo sintético de solo lectura a 390 × 844, 1366 × 517 y 1366 × 768.
- Publicación del candidato: avanzar main por fast-forward y verificar el despliegue automático, el dominio y el carrusel móvil.

## Fuentes por necesidad

- **Cola/estado de tareas:** [Plan, sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#9-diagnóstico-consolidado-y-cola-única--actualización-del-25102026); fila y último cierre del ID. Auditorías citadas sólo si falta evidencia, no como lectura inicial.
- **Diseño/UX/contenido:** [Directrices](SFSTORE-DIRECTRICES-MAESTRAS.md) y [Estándares](SFSTORE-ESTANDARES-DISENO-DESARROLLO.md): índices + secciones del flujo afectado y aceptación. Sin contenido o características inventadas.
- **Seguridad y tests:** [reglas permanentes/método](SECURITY_RULES.md); antecedentes sólo del área afectada.
- **Publicación/rollback:** [checklist vigente](production-checklist.md#reglas-vigentes-de-integración-y-publicación) y runbook aprobado del candidato; consultar artefactos privados sólo al ejecutar su tarea autorizada, sin versionar secretos/dumps.
- **Arquitectura y negocio:** [ARCHITECTURE](ARCHITECTURE.md), [BUSINESS_RULES](BUSINESS_RULES.md), [catálogo](catalog-data-model.md), [Sheets](google-sheets-product-sync.md); son referencias de sus fechas, contrastar con código actual. No recorrerlos completos por defecto.
- **Originales conservados:** [PROJECT_CONTEXT del 10/10](PROJECT_CONTEXT-HISTORICO-20261010.md), [AGENTS anterior](AGENTS-HISTORICO-20261027.md), [backlog histórico](DEVELOPMENT_BACKLOG.md). No son una segunda cola ni autorizaciones actuales.

## Mantenimiento de este estado

Después de cada avance, actualizar los campos anteriores (sin acumular diarios aquí), fecha, rama/candidato, estado productivo sólo con evidencia, bloqueos, autorización con alcance y próximo paso. Registrar detalles/resultados/historial en la tarea de la sección 9 o su fuente original y enlazarlos. Si se contradicen el archivo y Git/entorno, detener la acción sensible y resolver por evidencia; nunca descartar cambios para adaptar la realidad al resumen. No guardar contraseñas, tokens, correos de clientes, dumps ni costos privados en este estado.
