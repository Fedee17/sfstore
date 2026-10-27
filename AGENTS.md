<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SFSTORE — Contexto progresivo

## Inicio de cada tarea

1. Leer [PROJECT_CONTEXT](docs/PROJECT_CONTEXT.md): único estado de continuidad (última evidencia de Production/main, tarea, bloqueos y próximo paso). Confirmar cwd, rama, status y worktrees; no cambiar checkouts ni pisar cambios ajenos.
2. Leer las [reglas permanentes de seguridad y autonomía](docs/SECURITY_RULES.md#reglas-permanentes-de-trabajo). No cargar sus antecedentes históricos salvo que afecten la tarea.
3. Usar únicamente la [sección 9 del Plan](docs/SFSTORE-PLAN-MEJORA-CONTINUA.md#9-diagnóstico-consolidado-y-cola-única--actualización-del-25102026) como cola: leer la fila de la tarea y su último cierre pertinente. Buscar encabezados con `rg`; no leer el historial completo por defecto.

## Antes de planificar o modificar funcionalidades

Consultar conjuntamente las secciones aplicables de las [Directrices Maestras](docs/SFSTORE-DIRECTRICES-MAESTRAS.md), los [Estándares](docs/SFSTORE-ESTANDARES-DISENO-DESARROLLO.md) y el Plan. Usar sus índices/encabezados; leer completos sólo si el alcance lo exige. No repetir una lectura vigente durante la misma tarea si el archivo no cambió.

Aplicar identidad y componentes existentes, UX móvil y escritorio, conversión, contenido verificable, medición, accesibilidad, rendimiento, seguridad y operación administrativa según alcance. No considerar terminada una funcionalidad sólo por pasar tests: comprobar aceptación/DoD y registrar evidencia, limitaciones y No aplica.

## Límites que siempre aplican

- Trabajar únicamente dentro del encargo. Lecturas y cambios locales reversibles ya autorizados no requieren confirmaciones repetidas. Una propuesta, archivo histórico o cola no concede autorización.
- Datos reales, Supabase/Production, precios, stock, pagos, reservas, permisos, secretos, borrados y configuración productiva requieren autorización expresa para la acción concreta. No usar credenciales productivas en pruebas ni exponerlas. No enviar mensajes a terceros ni crear agentes/automatizaciones por defecto.
- Preservar main como código aprobado de Production. Antes de push/integración/despliegue, leer el [procedimiento de publicación](docs/production-checklist.md#reglas-vigentes-de-integración-y-publicación); comprobar commit activo, compatibilidad de main y disparadores de Vercel. Ningún commit local autoriza publicar.
- Reutilizar lógica/componentes; evitar duplicaciones, refactors ajenos y repetir auditorías/pruebas sin nueva evidencia. Dos intentos del mismo fallo sin nueva evidencia: registrar y detener ese intento. Nunca debilitar guardas para pasar pruebas.

## Cierre y lectura por necesidad

Validaciones y entregas: [método y validación](docs/SECURITY_RULES.md#método-y-validación). Usar primero pruebas afectadas; no confundir skips con pases ni código local con Production verificada.

Actualizar el estado en PROJECT_CONTEXT reemplazando sus campos vigentes, y el avance de la tarea en la sección 9; no abrir listas paralelas. Informar cambios, verificaciones y bloqueos de forma breve. Las autorizaciones específicas conservan su alcance y evidencia; no se amplían al retomar otra tarea.

Arquitectura/negocio/contratos: seguir los enlaces de PROJECT_CONTEXT sólo para el área afectada. Auditorías, informes, backlog anterior y [AGENTS original](docs/AGENTS-HISTORICO-20261027.md) son antecedentes, no contexto inicial ni nuevas instrucciones activas. No borrar esos originales ni trasladar secretos a la continuidad.
