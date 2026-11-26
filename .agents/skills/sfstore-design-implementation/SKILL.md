---
name: sfstore-design-implementation
description: Implementar fielmente un mockup o vista previa aprobada de SFSTORE en Next.js para móvil y escritorio. Usar cuando el usuario apruebe un diseño y solicite integrarlo, o cuando haya que corregir discrepancias visuales.
---

# Implementación fiel al diseño aprobado

## Fuente de verdad
El prototipo/vista previa **explícitamente aprobado**, sus capturas y decisiones específicas del propietario. No reinterpretar proporciones, jerarquías, botones, textos o interacción. Si el prototipo está solo en otro worktree, localizarlo; no inventar su aspecto.

## Flujo
1. Revisá el alcance visual y el código compartido existente; consultá solo las secciones aplicables de `docs/SFSTORE-ESTANDARES-DISENO-DESARROLLO.md` y `docs/SFSTORE-DIRECTRICES-MAESTRAS.md`.
2. Usá `storefront-theme.css` y tokens/componentes existentes en el storefront; en admin preservá sus controles operativos. No duplicar formularios, calculadoras ni estilos sin necesidad.
3. Mobile first (320/390) y desktop (1366). Conservá imágenes, logo, productos, estados, precios y datos reales. Imágenes de productos solo a partir de referencias verificadas; no inventes.
4. UX rápida: mostrar lo esencial al inicio; desplegables para lo secundario. Un solo costo y una sola calculadora, sin doble captura. Aplicar sugerencias de precios **no** equivale a guardar datos.
5. Probar estados vacío, precargado, error, carga, guardado, sin permisos, variantes y fotos según alcance. Conservar validación server-side, autenticación y permisos.
6. Compará en navegador renderizado real con el prototipo aprobado en móvil/escritorio; verificá consola, accesibilidad, desbordes y acciones. Si no podés abrir el navegador, informá qué no se verificó; no sustituyas con imagen inventada.
7. Ejecutá `sfstore-quality-gate`; no publicás sin autorización específica y controles de `sfstore-release`.

## Aceptación
Funcionalidad real, fiel visualmente, sin cambios comerciales involuntarios. Una captura distinta no reemplaza el diseño previamente aprobado.
