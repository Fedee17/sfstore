# SFSTORE — Continuidad actual

Actualizado: 04/11/2026 (Argentina). Única continuidad mutable; la única cola es la sección 9 del Plan. Este archivo no concede autorizaciones.

## Entorno y Production conocidos

- Repositorio Fedee17/sfstore; dominio https://sfstore-ten.vercel.app.
- main remoto: 30625ef403bd3bc79b4419381c1fb598c034a992, fast-forward y push normal verificados el 04/11; incluye 26b70b5 (seguridad Next) y 30625ef (mejoras autorizadas). Main local de otro worktree sigue atrasado.
- Deployment público: dpl_5GLkAmox6jcemusuA7HQJzZqd7d6, READY/Production, commit 30625ef, dominio sfstore-ten.vercel.app confirmado el 04/11. Recuperación: dpl_7vQ8nM1Lz7ZzukGmpMVfyALLEpNJ.
- Vercel sfstore: prj_XSoey2X2Oyqr8O5rBT8FBidxMrKV, equipo team_tab21Li6WWDl2lVutglfhidX. Production Branch main; Automatic restaurado y comprobado por lectura nueva; cero builds pendientes. No cambiar configuración por retomar el chat.
- Supabase xspvoicelbxlmtqoiolc: lotes de contenido 01/02/03 y migración de privacidad aplicados y verificados; cierres/hashes en sección 9. No repetir operaciones.
- Lote de 25 precios de perfumes aplicado y verificado: especial techo a $1.000 de costo ×1,40 y lista compatible con transferencia 25%; otros 54 registros preservados.
- Cinco perfumes publicados y verificados: Rome Pour Femme, 9AM Pour Femme, Maleka, Club de Nuit Woman y Hawas Malibú, con fichas y fotografías aprobadas.
- Fotografías completadas el 01/11: 51 restantes asociadas a 37 productos; 75 imágenes finales, incluidas 24 anteriores preservadas (cinco de la fase previa). Tres tomas redundantes no se volvieron a cargar. 75 URLs HTTP200 y hashes nuevos comprobados; sin borrados.
- Presentaciones incorporadas sólo a las descripciones aprobadas: Iconic 105 ml; Intense Man EDT 105 ml; Stallion 53 100 ml + atomizador 20 ml. Otros datos comerciales/atributos intactos.

## Trabajo actual y siguiente paso

- Worktree C:/dev/sfstore/.worktrees/store-readiness-20261101; rama codex/store-readiness-20261101; base b179011. No usar checkout raíz antiguo ni modificar otros worktrees.
- Encargo integral completado: datos/fotos verificados y mejoras publicadas mediante build Production sin dominio y promoción del mismo candidato. Sin cambios de seguridad/inventario ni otras migraciones. Cierre documental posterior conservado local, sin generar otro deployment.
- Publicado y comprobado: acción explícita +40% sólo para perfumes completos, validación monetaria en servidor y guardado atómico/versionado conservado. No recalcula al abrir, cambiar costo o guardar otros campos; familias/decants/combos excluidos.
- Publicado y comprobado: fotografías home/catálogo verticales completas; categorías legibles; header compacto con Ayuda → /ayuda; cargadores normalmente buscables sin bloque fijo redundante en venta local. Banners originales y contratos comerciales conservados.
- Acrili: Mate Algarrobo Acrilico está en borrador y stock cero; exclusión de búsqueda operativa correcta. No activar ni cambiar stock.
- Next y eslint-config-next 16.4.1 incorporados localmente por avisos oficiales de seguridad aplicables; sin cambios de configuración de seguridad. Audit runtime sin altas/críticas, una moderada; herramientas de desarrollo con avisos separados.
- Evidencia: 995 pruebas aprobadas, 0 fallidas, 19 omitidas; TypeScript/build correctos; ESLint 0 errores y 13 advertencias. Último ajuste CSS compacto: 19 pruebas afectadas y build correctos. Responsive 320/390/640/768/1366 sin overflow, teclado/búsqueda comprobados; capturas locales usan datos sintéticos identificados, no inventario real.
- Publicación cerrada el 04/11: home/catálogo a 390/768/1366 sin overflow; imágenes cargadas al recorrer la página, sin roturas; carrito/checkout verificados sin pedidos. Editor administrativo muestra acción +40% sin ejecutarla; venta local encuentra ambos cargadores sin bloque fijo. API pública no entrega Proveedor/costos; logs del deployment consultados sin error/fatal. Capturas reales en visualizaciones/store-readiness-20261101/production-*.png. Próximo paso: sólo tareas pendientes de sección 9, con autorización según alcance.
- Material fotográfico no entregado y decisiones comerciales adicionales permanecen en sección 9; sin nueva cola. 071633e sigue excluido. Historial y pruebas anteriores en sección 9 y Git; no repetirlas por retomar un chat.
## Fuentes por necesidad

- **Cola/estado de tareas:** [Plan, sección 9](SFSTORE-PLAN-MEJORA-CONTINUA.md#9-diagnóstico-consolidado-y-cola-única--actualización-del-25102026); fila y último cierre del ID. Auditorías citadas sólo si falta evidencia, no como lectura inicial.
- **Diseño/UX/contenido:** [Directrices](SFSTORE-DIRECTRICES-MAESTRAS.md) y [Estándares](SFSTORE-ESTANDARES-DISENO-DESARROLLO.md): índices + secciones del flujo afectado y aceptación. Sin contenido o características inventadas.
- **Seguridad y tests:** [reglas permanentes/método](SECURITY_RULES.md); antecedentes sólo del área afectada.
- **Publicación/rollback:** [checklist vigente](production-checklist.md#reglas-vigentes-de-integración-y-publicación) y runbook aprobado del candidato; consultar artefactos privados sólo al ejecutar su tarea autorizada, sin versionar secretos/dumps.
- **Arquitectura y negocio:** [ARCHITECTURE](ARCHITECTURE.md), [BUSINESS_RULES](BUSINESS_RULES.md), [catálogo](catalog-data-model.md), [Sheets](google-sheets-product-sync.md); son referencias de sus fechas, contrastar con código actual. No recorrerlos completos por defecto.
- **Originales conservados:** [PROJECT_CONTEXT del 10/10](PROJECT_CONTEXT-HISTORICO-20261010.md), [AGENTS anterior](AGENTS-HISTORICO-20261027.md), [backlog histórico](DEVELOPMENT_BACKLOG.md). No son una segunda cola ni autorizaciones actuales.

## Mantenimiento de este estado

Después de cada avance, actualizar los campos anteriores (sin acumular diarios aquí), fecha, rama/candidato, estado productivo sólo con evidencia, bloqueos, autorización con alcance y próximo paso. Registrar detalles/resultados/historial en la tarea de la sección 9 o su fuente original y enlazarlos. Si se contradicen el archivo y Git/entorno, detener la acción sensible y resolver por evidencia; nunca descartar cambios para adaptar la realidad al resumen. No guardar contraseñas, tokens, correos de clientes, dumps ni costos privados en este estado.
