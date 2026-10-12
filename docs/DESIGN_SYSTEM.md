# Sistema visual observado

Inventario de main `7a8a105`, 2026-10-10. No se realizó rediseño ni se afirma una auditoría visual completa de todas las pantallas.

## Identidad pública

`lib/brand.ts` define SFSTORE Importados y los enlaces WhatsApp, Instagram y mapa. Colores actuales:

| Uso | Valor |
| --- | --- |
| Principal | `#0072CE` |
| Azul profundo | `#003B73` |
| Acento rojo | `#E52620` |
| Fondo / superficie | `#F7F9FC` / `#FFFFFF` |
| Texto | `#102033` |
| Fondo tenue / borde | `#EEF2F6` / `#DCE3EA` |
| WhatsApp | `#25D366` |

Aliases olive/leather/cream/softBlack apuntan a esta paleta por compatibilidad. Preservar aliases mientras haya consumidores.

## Diferencias existentes

Muchas pantallas admin usan literales crema `#F7F4ED`, cuero `#8B5E3C`, oliva `#556B2F` y texto `#1F1F1F`, cards translúcidas, bordes suaves y radios grandes. La unificación con el sitio público no está autorizada: requiere revisión visual y del propietario.

`app/layout.tsx` carga Geist/Geist Mono y variables; `app/globals.css` enlaza tokens Tailwind pero el body declara Arial/Helvetica/sans-serif. También define fondo/foreground por preferencia oscura; varias páginas fijan colores claros. No hay un sistema único de tema coherente comprobado.

`components/site-header.tsx`, `product-grid.tsx`, `product-image-gallery.tsx`, `home-hero-slider.tsx` y formularios admin son referencias de UI existente. Assets/logo ya aparecen en el código; `brand-pendientes.md` conserva un pendiente antiguo. `home-banners-pendientes.md` describe paleta legacy: tratarlo como antecedente, no reemplazar la identidad azul actual automáticamente.

## Reglas para cambios futuros

Mantener idioma español argentino, formato ARS, mensajes claros y feedback de acciones pendientes/errores. Preservar legibilidad móvil, navegación por teclado, labels, focus visible y alternativas de imágenes. No eliminar estados vacíos/de error ni confundir éxito de metadata con borrado físico de archivo.

Correcciones pequeñas verificables de texto/layout pueden ser AUTÓNOMAS si no alteran negocio ni accesibilidad. Nueva jerarquía visual, cambio de paleta, nuevos componentes/flows o theme global son SUPERVISADOS. Verificar pantallas afectadas a 360 px y desktop, teclado y estados loading/error/vacío con fixtures; capturas solo de entornos locales o previews autorizados.

No reemplazar masivamente `<img>` por Image para silenciar warnings: evaluar orígenes Supabase, tamaños, carga y configuración. No inventar contraste aprobado sin medirlo. La revisión visual integral, edición de settings y nuevos banners quedan en el backlog.
