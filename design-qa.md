# Design QA — P07 / UX-N03

Referencia: propuesta combinada aprobada del worktree `mobile-navigation-proposals-20261023`, `docs/propuestas/2026-10-23-navegacion-movil/propuesta-combinada-movil.png`. Se abrieron referencia y capturas locales juntas para comparar. Objetivo móvil 390×844; mock es tablero de dos estados, no captura a escala 1:1. La geometría funcional se midió en DOM, no sobre píxeles del tablero. La captura integrada puede reflejar dimensiones del panel físico distintas; no se infiere precisión física del raster.

## Revisión de fidelidad

- Tipografía: se conserva Arial/Helvetica de la web, tamaños 14–16px en controles, H1 compacto 24px. No se copia el logo aproximado del mock.
- Espaciado: categorías en una fila, introducción compacta y tarjeta en primer viewport. Panel 58dvh y pie separado del scroll; no hay panel de pantalla completa ni doble scroll de fondo.
- Tokens: azul #0072CE, navy #003B73, texto #102033 y superficie #F7F9FC existentes. Selección se identifica por estado accesible y color; sección activa también subrayada.
- Imágenes: tarjetas y assets originales, datos sintéticos sin fotos ficticias. La tarjeta horizontal ilustrativa del mock no se implementa: conservar tarjetas actuales era condición documentada.
- Contenido: Ver productos como CTA (texto final aprobado); encabezado «Encontrá lo que buscás» y acceso «Elegí a tu gusto»; ayuda no duplicada; copy y datos comerciales reales no se reemplazan por ejemplos del diseño. Los filtros y opciones originales se conservan completos.

## Hallazgos resueltos

- P1: foco podía salir al tabular desde el final. Corregido y verificado en ambas direcciones.
- P2: posibilidad de mantener modal/scroll bloqueado al pasar a notebook. Cierre por breakpoint implementado y comprobado.
- P2: WhatsApp flotante invadía controles móviles en la línea base. Oculto en móvil, ayuda y consultas preservadas.

## Diferencias intencionales

Se conservan tarjetas verticales, logo, iconos y texto reales; sin rediseño de productos. Todas las opciones olfativas están en el scroll interno, sin un paso adicional «Ver todas». Categoría seleccionable dentro del panel permite partir de Todos, donde antes no había atributos disponibles. No cambia la semántica de un valor por grupo.

No quedan P0/P1/P2 abiertos dentro del alcance probado. Prueba física de Safari/Instagram y auditoría accesible completa no se presentan como realizadas; son límites de cobertura, no resultados inventados. Evidencia: informe y seis capturas en `docs/auditorias/2026-10-23-NAVEGACION-MOVIL-FILTROS.md`.

final result: passed
