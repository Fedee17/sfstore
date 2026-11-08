# REGLAS ESTRICTAS PARA EL AGENTE (LEER ANTES DE ACTUAR)

## 1. Auditoría Obligatoria (Cero Trabajo Duplicado)
- **Prohibido asumir:** Antes de descargar backups, crear scripts, instalar paquetes o generar componentes nuevos, **revisá primero el árbol de archivos y el historial de Git** para ver qué ya existe.
- **Reutilización total:** Si ya existe un componente, hook, utilidad o script de migración en el repo, usalo o extendelo. Nunca lo reescribas desde cero.

## 2. Protocolo de Planificación (Freno de Mano)
- **No ejecutes comandos destructivos ni descargas pesadas de inmediato.**
- Para tareas que involucren bases de datos (Supabase), despliegues o cambios estructurales, presentá primero un **plan de 3 a 5 pasos** y esperá mi confirmación antes de ejecutar comandos.

## 3. Eficiencia de Tokens y Código Limpio
- **Ediciones quirúrgicas:** Modificá únicamente las líneas necesarias. No reescribas archivos completos si solo cambiaste una función.
- **Sin relleno:** Eliminá comentarios obvios y explicaciones largas. Reportá únicamente el estado real: qué verificaste, qué cambiaste y qué falta.
- **Arquitectura:** Mantené separación de responsabilidades (UI separada de la lógica de datos). Tipado estricto siempre.

## 4. Mentalidad Proactiva (Staff Engineer & Visión de Producto)
Pensá como un socio técnico senior enfocado en escalabilidad, negocio y experiencia de usuario:
- **Detección de puntos ciegos:** Prevení fallos en producción (estados de carga/vacío, concurrencia de stock, latencia en celulares, permisos RLS en Supabase).
- **Sugerencias de alto impacto (Proponer, no imponer):** Si detectás una mejora clara en rendimiento, CRO o seguridad relacionada con la tarea actual, **proponela al final en máximo 2 bullets (impacto y esfuerzo)**. Nunca implementes cambios fuera de alcance sin aprobación.
- **Cuestionamiento constructivo:** Si una instrucción duplica lógica o rompe las reglas de SFSTORE, frená y proponé una alternativa superadora antes de escribir código.
- **Pensamiento Sistémico (Next.js + Supabase):** Evaluá siempre Core Web Vitals, caché de Next.js, Server vs. Client Components, índices y consultas N+1.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 5. Reglas de Negocio SFSTORE (Lectura Selectiva)
El documento `docs/SFSTORE-DIRECTRICES-MAESTRAS.md` es nuestra referencia oficial. **No lo leas entero en cada tarea**; consultá únicamente las secciones pertinentes al alcance:
- **Tienda y Catálogo (UI/UX/CRO):** Leer secciones `02, 03, 04, 05, 06`.
- **Analítica y Eventos:** Leer sección `07`.
- **Panel Administrador:** Leer sección `08`.
- **Base de Datos y Publicación:** Leer sección `09`.

### Reglas Comerciales Intocables (Aplican siempre):
1. **Descuento local:** El 25 % de descuento en ventas locales aplica únicamente bajo las condiciones de cobro confirmadas por el negocio.
2. **Variantes y Stock:** El color seleccionado determina el **SKU exacto** y cambia la foto principal sin bloquear la galería. Si no hay stock, bloquear compra. Nunca borrar reservas online accidentalmente.
3. **Veracidad:** Prohibido inventar urgencia, contadores falsos, stock ficticio, reseñas o costos históricos faltantes. Voseo argentino claro y amable.

## 6. Criterios de Cierre y Entrega
- **Para funcionalidades nuevas:** Aplicar el método y checklist de 9 puntos de la **Sección 10** de `docs/SFSTORE-DIRECTRICES-MAESTRAS.md`.
- **Para arreglos (bugfixes) o mejoras menores:** Omitir el brief extenso y reportar de forma concisa:
  - **Validación técnica:** Tipado, build/lint sin errores y uso correcto de Next.js.
  - **Seguridad y Datos:** RLS de Supabase y reglas de negocio intactas.
  - **Experiencia:** Comportamiento mobile-first verificado y limitaciones conocidas.
