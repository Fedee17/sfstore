# SFSTORE — Continuidad actual

Actualizado: 05/11/2026 (Argentina). Única continuidad mutable; la única cola es la sección 9 del Plan. Este archivo no concede autorizaciones.

## Entorno y Production conocidos

- Repositorio Fedee17/sfstore; dominio https://sfstore-ten.vercel.app.
- Main local y origin/main en d08df6c153c2e4bec64c7c12f8fec650f96aa698.
- Último deployment público verificado: dpl_3JBvPQpEC5EUfXoTS1upLAXShaCj, READY/Production, commit d08df6c. Recuperación: dpl_84Y2LBeNop7WFVnjrRFSkhF3GZZb / 40bac0a.
- Vercel sfstore: prj_XSoey2X2Oyqr8O5rBT8FBidxMrKV, equipo team_tab21Li6WWDl2lVutglfhidX. Rama de Production main, despliegues Git habilitados y sin comando para ignorar builds. Sin despliegues pendientes en la comprobación previa.
- Supabase xspvoicelbxlmtqoiolc: lotes de contenido 01/02/03 y migración de privacidad aplicados y verificados; cierres/hashes en sección 9. No repetir operaciones.
- Lote de 25 precios de perfumes aplicado y verificado: especial techo a $1.000 de costo ×1,40 y lista compatible con transferencia 25%; otros 54 registros preservados.
- Cinco perfumes publicados y verificados: Rome Pour Femme, 9AM Pour Femme, Maleka, Club de Nuit Woman y Hawas Malibú, con fichas y fotografías aprobadas.
- Fotografías completadas el 01/11: 51 restantes asociadas a 37 productos; 75 imágenes finales, incluidas 24 anteriores preservadas (cinco de la fase previa). Tres tomas redundantes no se volvieron a cargar. 75 URLs HTTP200 y hashes nuevos comprobados; sin borrados.
- Presentaciones incorporadas sólo a las descripciones aprobadas: Iconic 105 ml; Intense Man EDT 105 ml; Stallion 53 100 ml + atomizador 20 ml. Otros datos comerciales/atributos intactos.

## Trabajo actual y siguiente paso

- P05 / EXT-O1 publicado y verificado en d08df6c. Las fichas muestran lista y transferencia redondeadas al peso, también al elegir variantes. El carrito recibe los importes exactos.
- Verificación: build Turbopack, TypeScript y 38 pruebas pertinentes. Se comprobó la presentación en las fichas públicas de Dubai Night y Dispenser de yerba en madera mediante lecturas HTTP.
- P02 queda pendiente del material fotográfico. P08: nueve fichas públicas revisadas. El propietario confirmó que el decant de Kahambra es de 5 ml del Khamrah original. Se corrigieron el nombre y las descripciones en Production y se verificó la ficha pública. Los otros registros similares de P08 quedan pendientes de conciliación.
- P02 / P08: El propietario pidió fotos completas, de borde a borde. En el candidato local codex/khamrah-decant-framing-20261105 cada galería de ficha ocupa el ancho disponible y su altura sigue la proporción original, también en variantes. Se retiró el fondo desenfocado y el marco cuadrado para fotos cargadas. Build Turbopack, 26 pruebas y Playwright a 390 × 844 y 1366 × 844 correctos. El propietario autorizó publicar este candidato. Queda comprobar la versión activa tras el despliegue.

## Fuentes por necesidad

- **Cola/estado de tareas:** [Plan, sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#9-diagnóstico-consolidado-y-cola-única--actualización-del-25102026); fila y último cierre del ID. Auditorías citadas sólo si falta evidencia, no como lectura inicial.
- **Diseño/UX/contenido:** [Directrices](SFSTORE-DIRECTRICES-MAESTRAS.md) y [Estándares](SFSTORE-ESTANDARES-DISENO-DESARROLLO.md): índices + secciones del flujo afectado y aceptación. Sin contenido o características inventadas.
- **Seguridad y tests:** [reglas permanentes/método](SECURITY_RULES.md); antecedentes sólo del área afectada.
- **Publicación/rollback:** [checklist vigente](production-checklist.md#reglas-vigentes-de-integración-y-publicación) y runbook aprobado del candidato; consultar artefactos privados sólo al ejecutar su tarea autorizada, sin versionar secretos/dumps.
- **Arquitectura y negocio:** [ARCHITECTURE](ARCHITECTURE.md), [BUSINESS_RULES](BUSINESS_RULES.md), [catálogo](catalog-data-model.md), [Sheets](google-sheets-product-sync.md); son referencias de sus fechas, contrastar con código actual. No recorrerlos completos por defecto.
- **Originales conservados:** [PROJECT_CONTEXT del 10/10](PROJECT_CONTEXT-HISTORICO-20261010.md), [AGENTS anterior](AGENTS-HISTORICO-20261027.md), [backlog histórico](DEVELOPMENT_BACKLOG.md). No son una segunda cola ni autorizaciones actuales.

## Mantenimiento de este estado

Después de cada avance, actualizar los campos anteriores (sin acumular diarios aquí), fecha, rama/candidato, estado productivo sólo con evidencia, bloqueos, autorización con alcance y próximo paso. Registrar detalles/resultados/historial en la tarea de la sección 9 o su fuente original y enlazarlos. Si se contradicen el archivo y Git/entorno, detener la acción sensible y resolver por evidencia; nunca descartar cambios para adaptar la realidad al resumen. No guardar contraseñas, tokens, correos de clientes, dumps ni costos privados en este estado.
