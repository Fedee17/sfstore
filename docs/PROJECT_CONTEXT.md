# SFSTORE — Continuidad actual

Actualizado: 05/11/2026 (Argentina). Única continuidad mutable; la única cola es la sección 9 del Plan. Este archivo no concede autorizaciones.

## Entorno y Production conocidos

- Repositorio Fedee17/sfstore; dominio https://sfstore-ten.vercel.app.
- Main local y remoto: 18b3fc7d3d56e633f8c1e8e831453cde6d8be6c0, sincronizados por fast-forward el 05/11. El build automático de ese push fue cancelado por el bloqueo temporal, luego restaurado a Automatic.
- Deployment público: dpl_35h7aERS79bhpFPPAVzcPTrrnvwG, READY/Production, commit 18b3fc7. El dominio respondió HTTP 200 y sirvió Destacados después de la promoción y la sincronización. Recuperación: dpl_5GLkAmox6jcemusuA7HQJzZqd7d6 / 30625ef.
- Vercel sfstore: prj_XSoey2X2Oyqr8O5rBT8FBidxMrKV, equipo team_tab21Li6WWDl2lVutglfhidX. Production Branch main; Automatic restaurado y comprobado por lectura nueva; cero builds pendientes. No cambiar configuración por retomar el chat.
- Supabase xspvoicelbxlmtqoiolc: lotes de contenido 01/02/03 y migración de privacidad aplicados y verificados; cierres/hashes en sección 9. No repetir operaciones.
- Lote de 25 precios de perfumes aplicado y verificado: especial techo a $1.000 de costo ×1,40 y lista compatible con transferencia 25%; otros 54 registros preservados.
- Cinco perfumes publicados y verificados: Rome Pour Femme, 9AM Pour Femme, Maleka, Club de Nuit Woman y Hawas Malibú, con fichas y fotografías aprobadas.
- Fotografías completadas el 01/11: 51 restantes asociadas a 37 productos; 75 imágenes finales, incluidas 24 anteriores preservadas (cinco de la fase previa). Tres tomas redundantes no se volvieron a cargar. 75 URLs HTTP200 y hashes nuevos comprobados; sin borrados.
- Presentaciones incorporadas sólo a las descripciones aprobadas: Iconic 105 ml; Intense Man EDT 105 ml; Stallion 53 100 ml + atomizador 20 ml. Otros datos comerciales/atributos intactos.

## Trabajo actual y siguiente paso

- Destacados publicado y sincronizado el 05/11. En Production pasaron 375, 390 y 1366 px de ancho, seis fichas, fotografías, importes y disponibilidad, y el recorrido hasta el formulario de checkout sin transacciones. Ver el cierre en la sección 9.
- Encargo vigente: corregir la oferta del menú Perfumes y el espacio disponible para Destacados en pantallas bajas. Base 18b3fc7, rama codex/storefront-header-featured-fit-20261105 y worktree homónimo.
- Ajuste local: Diseñador y Nicho salen de la navegación y los filtros públicos. En escritorio de poca altura el encabezado fluye con la página y la foto se ajusta para que se pueda ver la tarjeta completa al desplazarla a pantalla.
- Verificación local: build Turbopack y TypeScript correctos, 51 pruebas relacionadas aprobadas y ESLint sin errores, con un aviso existente de imagen. Playwright verificó los filtros en celular, el desplegable por teclado y filas completas en cinco tamaños, incluido 1366 × 517 con una altura de tarjeta de 468 px.
- Refinamiento posterior: las URLs antiguas de Diseñador y Nicho redirigen a Perfumes conservando los filtros restantes. El encuadre de escritorio bajo muestra completos los productos mediante posiciones individuales y laterales suavizados con la misma foto. Revisión de las dos filas a 1366 × 517 y de escritorio normal a 1366 × 768 y celular a 390 × 844. Se conservan las dimensiones previas y los CTA de 44 px. Build y TypeScript correctos, 56 pruebas aprobadas y cuatro redirecciones verificadas con Playwright.
- Próximo paso: revisar las correcciones locales y autorizar expresamente su publicación. La autorización anterior correspondía al candidato 18b3fc7.

## Fuentes por necesidad

- **Cola/estado de tareas:** [Plan, sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#9-diagnóstico-consolidado-y-cola-única--actualización-del-25102026); fila y último cierre del ID. Auditorías citadas sólo si falta evidencia, no como lectura inicial.
- **Diseño/UX/contenido:** [Directrices](SFSTORE-DIRECTRICES-MAESTRAS.md) y [Estándares](SFSTORE-ESTANDARES-DISENO-DESARROLLO.md): índices + secciones del flujo afectado y aceptación. Sin contenido o características inventadas.
- **Seguridad y tests:** [reglas permanentes/método](SECURITY_RULES.md); antecedentes sólo del área afectada.
- **Publicación/rollback:** [checklist vigente](production-checklist.md#reglas-vigentes-de-integración-y-publicación) y runbook aprobado del candidato; consultar artefactos privados sólo al ejecutar su tarea autorizada, sin versionar secretos/dumps.
- **Arquitectura y negocio:** [ARCHITECTURE](ARCHITECTURE.md), [BUSINESS_RULES](BUSINESS_RULES.md), [catálogo](catalog-data-model.md), [Sheets](google-sheets-product-sync.md); son referencias de sus fechas, contrastar con código actual. No recorrerlos completos por defecto.
- **Originales conservados:** [PROJECT_CONTEXT del 10/10](PROJECT_CONTEXT-HISTORICO-20261010.md), [AGENTS anterior](AGENTS-HISTORICO-20261027.md), [backlog histórico](DEVELOPMENT_BACKLOG.md). No son una segunda cola ni autorizaciones actuales.

## Mantenimiento de este estado

Después de cada avance, actualizar los campos anteriores (sin acumular diarios aquí), fecha, rama/candidato, estado productivo sólo con evidencia, bloqueos, autorización con alcance y próximo paso. Registrar detalles/resultados/historial en la tarea de la sección 9 o su fuente original y enlazarlos. Si se contradicen el archivo y Git/entorno, detener la acción sensible y resolver por evidencia; nunca descartar cambios para adaptar la realidad al resumen. No guardar contraseñas, tokens, correos de clientes, dumps ni costos privados en este estado.
