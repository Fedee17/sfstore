# SFSTORE — Continuidad actual

Actualizado: 09/11/2026 (Argentina). Única continuidad mutable; la única cola es la sección 9 del Plan. Este archivo no concede autorizaciones.

## Entorno y Production conocidos

- Repositorio Fedee17/sfstore; dominio https://sfstore-ten.vercel.app.
- `main` local y `origin/main` en 8ded68e7ebfe58d33bff4143e04a9f7b78b57589; worktree main limpio, verificado el 09/11.
- Production reconfirmada el 09/11: dpl_DAGaMRmQXoXNdrkMNct1LMjZwuEh, READY, commit 8ded68e; dominio sfstore-ten.vercel.app asignado a ese deployment. Build estándar productivo aprobado. Recuperación previa: dpl_8J19GvdokTGN1hJkUqr4rmnrA2Cw / 0119ae8.
- Vercel sfstore: prj_XSoey2X2Oyqr8O5rBT8FBidxMrKV, equipo team_tab21Li6WWDl2lVutglfhidX. Rama de Production main, despliegues Git habilitados y sin comando para ignorar builds. Sin despliegues pendientes en la comprobación previa.
- Supabase xspvoicelbxlmtqoiolc: lotes de contenido 01/02/03 y migración de privacidad aplicados y verificados; cierres/hashes en sección 9. No repetir operaciones.
- Lote de 25 precios de perfumes aplicado y verificado: especial techo a $1.000 de costo ×1,40 y lista compatible con transferencia 25%; otros 54 registros preservados.
- Cinco perfumes publicados y verificados: Rome Pour Femme, 9AM Pour Femme, Maleka, Club de Nuit Woman y Hawas Malibú, con fichas y fotografías aprobadas.
- Fotografías completadas el 01/11: 51 restantes asociadas a 37 productos; 75 imágenes finales, incluidas 24 anteriores preservadas (cinco de la fase previa). Tres tomas redundantes no se volvieron a cargar. 75 URLs HTTP200 y hashes nuevos comprobados; sin borrados.
- Presentaciones incorporadas sólo a las descripciones aprobadas: Iconic 105 ml; Intense Man EDT 105 ml; Stallion 53 100 ml + atomizador 20 ml. Otros datos comerciales/atributos intactos.

## Trabajo actual y siguiente paso

- Salud de Stock publicado con autorización: commit 8ded68e, migración exclusiva 202611080003_stock_health_snapshot.sql aplicada y grants service_role verificados. Datos reales: 0 riesgos de quiebre y 67 SKU con capital inmovilizado; Top 5 y expansión. Sin etiqueta de propuesta. Ver producto abre la ficha administrativa; la ruta de inventario por SKU responde. No había alertas de riesgo para probar un botón Revisar stock real. Chrome 390/escritorio sin overflow en la comprobación de publicación. Evidencia stock-health-production.png en artefactos de sesión.
- Tienda pública: plan de cinco pasos implementado/validado; el propietario autorizó expresamente publicarlo el 09/11. Rama codex/storefront-journey-20261108, worktree stock-health-release-20261108, base 8ded68e. Home comparte elegibilidad y retira fotografías fallidas; CTA compartido, indicador de transferencia único, nombres comerciales revisados, regalos materos, galería por SKU y WhatsApp contextual, aviso de redondeo y recuperación accesible de errores de checkout. Importes exactos, reservas, RLS y servidor transaccional intactos.
- Validación local actual: build estándar Turbopack y TypeScript aprobados; suite general 1.069 pruebas, 1.047 pases, 22 omisiones opcionales y cero fallos; ESLint cero errores y 12 advertencias previas. Tres pruebas integrales de navegador ejecutadas aparte y aprobadas: 14 casos de feedback de checkout, cotización/tarifa de envío y recorrido Home→SKU→carrito→checkout a 320/390/768/1366x517/1366x768. Sin overflow ni errores JS en los cinco recorridos; rotación automática comprobada a 390/1366. Las omisiones de la suite general no se cuentan como pases.
- Bloqueos de validación resueltos: node_modules ahora es una carpeta física propia del checkout, preparada desde la instalación local existente (sin descargas, cambios de versiones o configuración). Turbopack aprobado fuera del sandbox, que impedía crear el enlace interno de xlsx. El control interactivo de Codex sigue fallando por kernel assets, pero se reutilizó Playwright real 1.62.1 del runtime existente y Edge con perfil limpio para validar/sacar capturas. Se detectó y corrigió foco de email inválido reutilizando validateForm; la galería funciona tras hidratación. Preview cerrado; sin pedidos, pagos ni escrituras productivas. Capturas journey-* y logs storefront-* en artefactos de sesión.
- Publicación autorizada el 09/11: preflight main/origin 8ded68e y dominio Stock READY, sin builds pendientes; candidato acotado sin SQL/configuración. Siguiente paso: commit del alcance validado, fast-forward de main, push único que activa el build estándar y control público sin pedidos/pagos. Recuperación al deployment de Stock dpl_DAGaMRmQXoXNdrkMNct1LMjZwuEh; informar antes de revertir.
- Alcance ajeno preservado: worktree admin-business-improvements mantiene 041b211 y cambios de navegación/documentación sin publicar; la migración de monitor 202611080002 no se incluyó en la publicación de Stock. No eliminar worktrees ni mezclar pendientes. Los cierres anteriores se conservan en la sección 9 y fuentes originales; sus estados históricos no sustituyen el estado actual.

## Fuentes por necesidad

- **Cola/estado de tareas:** [Plan, sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#9-diagnóstico-consolidado-y-cola-única--actualización-del-25102026); fila y último cierre del ID. Auditorías citadas sólo si falta evidencia, no como lectura inicial.
- **Diseño/UX/contenido:** [Directrices](SFSTORE-DIRECTRICES-MAESTRAS.md) y [Estándares](SFSTORE-ESTANDARES-DISENO-DESARROLLO.md): índices + secciones del flujo afectado y aceptación. Sin contenido o características inventadas.
- **Seguridad y tests:** [reglas permanentes/método](SECURITY_RULES.md); antecedentes sólo del área afectada.
- **Publicación/rollback:** [checklist vigente](production-checklist.md#reglas-vigentes-de-integración-y-publicación) y runbook aprobado del candidato; consultar artefactos privados sólo al ejecutar su tarea autorizada, sin versionar secretos/dumps.
- **Arquitectura y negocio:** [ARCHITECTURE](ARCHITECTURE.md), [BUSINESS_RULES](BUSINESS_RULES.md), [catálogo](catalog-data-model.md), [Sheets](google-sheets-product-sync.md); son referencias de sus fechas, contrastar con código actual. No recorrerlos completos por defecto.
- **Originales conservados:** [PROJECT_CONTEXT del 10/10](PROJECT_CONTEXT-HISTORICO-20261010.md), [AGENTS anterior](AGENTS-HISTORICO-20261027.md), [backlog histórico](DEVELOPMENT_BACKLOG.md). No son una segunda cola ni autorizaciones actuales.

## Mantenimiento de este estado

Después de cada avance, actualizar los campos anteriores (sin acumular diarios aquí), fecha, rama/candidato, estado productivo sólo con evidencia, bloqueos, autorización con alcance y próximo paso. Registrar detalles/resultados/historial en la tarea de la sección 9 o su fuente original y enlazarlos. Si se contradicen el archivo y Git/entorno, detener la acción sensible y resolver por evidencia; nunca descartar cambios para adaptar la realidad al resumen. No guardar contraseñas, tokens, correos de clientes, dumps ni costos privados en este estado.
