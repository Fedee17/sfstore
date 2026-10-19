# SFSTORE — ESTÁNDARES DE DISEÑO Y DESARROLLO

**Versión:** 1.0 · **Fecha:** 18/10/2026 · **Estado:** Propuesta para revisión y adopción  
**Ámbito:** tienda online, experiencia móvil, checkout y panel administrador  
**Documento rector:** `docs/SFSTORE-DIRECTRICES-MAESTRAS.md` (Manual Maestro de Experiencia Digital v1.0)

> **Regla central:** una funcionalidad está lista cuando funciona, se entiende, respeta la identidad de SFSTORE, facilita el objetivo del usuario y puede verificarse sin poner en riesgo operaciones reales.

## 1. Propósito, alcance y precedencia

Este documento convierte las directrices maestras en **criterios de implementación y aceptación** para Codex. No autoriza por sí mismo cambios en Production, datos, precios, inventario o procesos de pago.

- **Incluye:** UI, UX, contenido comercial web, conversión, medición, accesibilidad, rendimiento, panel admin, QA y entregas.
- **Excluye:** estrategia editorial detallada de Instagram y TikTok, definida en el *Manual Maestro de Contenido SFSTORE 2026*.
- **Prioridad ante conflictos:** integridad y seguridad de datos → decisiones comerciales confirmadas → claridad y accesibilidad → UX y conversión → consistencia visual.
- **Distinción obligatoria:** **confirmado**, **propuesto** y **pendiente de verificar**. Codex no debe convertir hipótesis de diseño, costos, datos de producto o métricas en hechos.

## 2. Identidad UI: sistema antes que pantallas

**Estilo:** boutique cálida, natural, moderna, cercana y accesible. Referencias: verde oliva, marrones, blanco cálido, negro mate, madera y luz cálida. **No hay paleta HEX ni tipografías definitivas aprobadas:** se definirán tras auditar la interfaz y validar propuestas visuales. No crear una identidad alternativa por cuenta propia.

**Reglas operativas:**

1. Utilizar **tokens reutilizables** para colores, tipografía, espaciados, radios, sombras y estados; evitar valores repetidos por pantalla.
2. Mantener jerarquía consistente: título claro, precio y disponibilidad visibles, CTA primario distinguible; los productos y sus fotografías dominan la composición.
3. El espacio en blanco es funcional: agrupa decisiones y mejora lectura. Evitar tarjetas saturadas, carruseles superpuestos, exceso de insignias, dorados, mármol y efectos decorativos.
4. No sustituir fotos reales de producto por elementos generados o genéricos sin autorización. No alterar visualmente el color o presentación de un artículo.
5. Establecer estados visuales coherentes para **normal, hover, foco, seleccionado, deshabilitado, cargando, éxito y error**. No indicar estados solo mediante color.
6. Cualquier cambio de paleta, logo, tipografía principal o patrón global requiere propuesta comparativa y aprobación del propietario.

**Componentes a normalizar al auditar:** encabezado y navegación móvil, buscador, tarjeta, galería, selector de variantes, precio, CTA, badges, formulario, resumen de compra, mensajes de estado, tablas y filtros del admin. Reutilizar antes de duplicar.

## 3. Diseño responsive y accesibilidad

**Prioridad:** diseñar y verificar primero en pantalla móvil. Como mínimo revisar anchos cercanos a **390 px** y **1366 px**; sumar un ancho móvil compacto si el componente es sensible. Estas dimensiones son **referencias de prueba, no breakpoints obligatorios**.

**Criterios de aceptación:**

- Sin desplazamiento horizontal involuntario; texto, precio, disponibilidad y acciones no se cortan.
- Objetivos táctiles de tamaño cómodo; separación suficiente entre controles; CTA principal accesible sin superponerse con navegación o banners.
- Teclado: orden de tabulación comprensible, foco visible, apertura/cierre de menús y diálogos, retorno de foco y operación sin mouse.
- Formularios con `<label>` real, descripciones contextualizadas, errores asociados al campo y mensajes recuperables.
- Imágenes con texto alternativo útil; imágenes puramente decorativas sin ruido para lectores de pantalla.
- Contraste de texto/control conforme al objetivo **WCAG 2.2 AA**, validado con herramienta; no se presupone que la paleta actual lo cumple.
- Preferencias de movimiento reducido respetadas para animaciones no esenciales.
- Verificación con contenido realista: nombres largos, precios de distinto ancho, cero stock, errores y red lenta.

## 4. Página de inicio y navegación

La primera pantalla debe responder **qué vende SFSTORE, por qué conviene explorar y cómo empezar**. La estructura se definirá tras auditar la página existente, no a partir de una plantilla genérica.

- Hacer encontrables **Perfumes**, **Mates y termos** y **Regalos**, sin mezclar el relato de cada categoría.
- Reducir pasos hasta la ficha y evitar menús redundantes. Buscar y filtrar debe devolver resultados comprensibles y permitir recuperarse de «sin resultados».
- Mostrar promociones, envíos, retiro y medios de pago solo cuando estén confirmados y respaldados por el funcionamiento vigente.
- Enlaces y botones con verbos precisos: «Ver perfumes», «Explorar mates», «Elegir color», «Agregar al carrito».
- Evitar banners vacíos, urgencias inventadas, testimonios ficticios y secciones sin intención comercial.

## 5. Catálogo y tarjetas de producto

Una tarjeta aprobada permite reconocer **producto, variante si aplica, precio aplicable, disponibilidad** y siguiente acción sin abrir múltiples vistas.

- Fotografía nítida, recorte consistente y proporciones cuidadas sin ocultar atributos relevantes.
- Nombre reconocible; no saturar con descripciones largas ni badges acumulados.
- Si se muestran dos precios, **etiquetar explícitamente** el precio de lista y el de efectivo/transferencia; no inducir a pensar que todo medio de pago recibe descuento.
- No mostrar un precio promocional ficticio ni usar precio tachado si no corresponde a una comparación comercial legítima.
- Agotado y no disponible deben distinguirse cuando el sistema contemple esos estados.
- Los filtros por categoría, marca, uso o atributo deben reflejar datos realmente disponibles y consistentes; no inventar taxonomías.

## 6. Ficha de producto y selección de variantes

**Foco comercial:** ayudar a elegir, no solo mostrar especificaciones. Orden recomendado de información: nombre → imágenes → precio → disponibilidad → decisión de variante/cantidad → CTA → atributos y descripción útiles. Ajustar tras pruebas reales.

**Contrato de variantes (validado para Stanley MateSystem):**

1. **La variante seleccionada determina el SKU** que se agrega al carrito y se compra.
2. Seleccionar un color muestra automáticamente la **foto principal asociada** a ese SKU.
3. La **galería sigue siendo libre**: navegar fotos de otros colores **no cambia** el SKU seleccionado.
4. El color elegido debe verse en el selector, carrito, checkout y, cuando corresponda, confirmación de compra.
5. La opción sin stock puede mostrar imagen y estado «Agotado», pero **no permite agregar** esa variante.
6. La selección, precio y disponibilidad se revalidan del lado del servidor en procesos críticos; el cambio visual no sustituye estas validaciones.
7. No depender del orden de imágenes para asignar colores: usar identificadores y asociaciones explícitas verificables.

**Ejemplo operativo — Stanley 1L MateSystem:** cinco colores con fotografía propia; el precio confirmado en efectivo/transferencia es **$35.000 por unidad** y el verde tiene stock cero al cierre de la regularización de 18/10/2026. **Estos datos son un ejemplo fechado, no valores perpetuos para hardcodear**: la web debe leer la fuente comercial vigente.

## 7. Carrito y checkout: confianza e integridad

- Presentar para cada línea: producto, **variante exacta**, imagen coherente, cantidad, precio unitario y subtotal.
- Permitir corregir o quitar artículos con retroalimentación clara; conservar selección al recargar cuando esté soportado.
- Mostrar importes, descuentos, total, modalidad de entrega y condiciones antes de confirmar. **No modificar reglas comerciales para resolver una cuestión visual.**
- Comunicar estados: procesando, pendiente de pago, pago verificado, error, expiración de reserva, compra finalizada; mensajes siempre basados en estado real.
- Mantener la integridad de reservas online, concurrencia, idempotencia y disponibilidad server-side. No generar ventas, pagos ni stock ficticios durante pruebas visuales.
- El actual flujo de reservas online y sus plazos **no deben alterarse** sin definición de negocio y pruebas específicas.
- Instrumentar una compra **una sola vez**; ni recarga ni reintento deben duplicar datos o eventos de conversión.

## 8. Conversión y contenido comercial

**Toda interfaz debe declarar qué fricción resuelve**: encontrar, comprender, comparar, confiar, elegir, pagar o consultar.

**Perfumes:** recomendaciones según gustos, ocasión y familia olfativa verificable; explicar qué esperar sin prometer duración o notas no corroboradas; facilitar descubrir decants para probar si existen y están disponibles.  
**Mates y termos:** materiales, capacidad, mantenimiento y posibilidades reales de combinación; sugerir bombilla, yerba o set de regalo solo si corresponde.  
**Regalos:** destacar para quién puede servir, presentación y personalización *cuando esté disponible*; no afirmar servicios inexistentes.

**Microcopy:** voseo argentino, frases cortas, información específica. Un CTA principal por contexto y secundarios discretos. Ejemplos: «Elegí tu color», «Probá antes de decidir», «Ver qué incluye». **No** utilizar «calidad premium al mejor precio», falsa escasez o presión engañosa.

**Venta cruzada:** contexto y compatibilidad primero; nunca bloquear checkout ni elegir complementos automáticamente. Evaluar posición y utilidad con medición, no con intuición presentada como resultado.

## 9. Medición y privacidad

**Antes de instrumentar:** auditar herramientas instaladas (p. ej., GA4, Pixel u otras), consentimiento aplicable, eventos existentes y posibles duplicados. **No asumir integraciones activas**.

| Evento conceptual | Disparo esperado | Parámetros mínimos no sensibles | Control |
|---|---|---|---|
| `view_item_list` | Lista visible según definición analítica | listado, ítems | Evitar duplicar por render |
| `view_item` | Vista de ficha | producto, categoría | No contar cada re-render |
| `select_item_variant` | Cambio deliberado de variante | producto, SKU/variante | No emitir por cada foto vista |
| `add_to_cart` | Agregado confirmado | SKU, cantidad, valor, moneda | Confirmar éxito |
| `begin_checkout` | Inicio real del flujo | valor, moneda, cantidad de ítems | Evitar duplicados por navegación |
| `purchase` | Pedido confirmado según política definida | ID de pedido estable, valor, moneda | Deduplicación obligatoria |
| `contact_click` | Inicio de consulta | origen, categoría | Sin número/teléfono personal |

**KPIs a definir con denominadores y período:** ficha/listado, agregado/ficha, checkout/carrito, compra/checkout, errores por paso, consultas y rendimiento móvil. Segmentar solo si hay suficiente volumen; **no atribuir causalidad sin evidencia**. Nunca enviar datos bancarios, datos personales, mensajes de clientes ni secretos a herramientas de analítica.

**Implementación mínima:** especificación de disparo y esquema, consentimiento y privacidad, prueba en entorno seguro, deduplicación y verificación contra transacciones reales sin exponer datos sensibles. Si falta infraestructura, documentar el evento esperado y señalar «pendiente de instrumentación».

## 10. Panel administrador: diseño para operar el negocio

**Prioridad:** menos errores, menos pasos y lectura rápida durante la atención presencial.

- **Productos y variantes:** mostrar identificación exacta, familia/SKU, precio aplicado, costo y existencias; distinguir stock total, reservado y disponible cuando corresponda.
- **Compras y ventas:** fechas comerciales, medio de pago, estado y origen claramente diferenciados; prevenir doble envío y duplicación de movimientos.
- **Histórico vs actual:** señalizar operaciones importadas, ventas actuales y regularizaciones; jamás completar márgenes históricos faltantes con costos vigentes como si fueran históricos.
- **Formularios:** guardado visible, validación del servidor, confirmación contextual para operaciones de alto impacto y errores con recuperación clara.
- **Usabilidad:** búsqueda eficiente, filtros comprensibles, acciones frecuentes localizables, densidad adecuada en notebook y scroll legible en teléfono cuando aplique.
- **No priorizar estética sobre integridad:** cada alta/edición/archivo/venta se debe verificar con permisos, estados y auditoría correspondientes.

## 11. Arquitectura y seguridad: criterios de Codex

El repositorio usa **Next.js y Supabase**. La implementación deberá inspeccionar su arquitectura real antes de decidir rutas, tablas, RPC, componentes, librerías de UI o analítica.

- Aplicar autenticación y autorización en servidor; validar entradas en servidor; mantener rutas administrativas protegidas.
- Mantener claves privilegiadas y `service_role` exclusivamente del lado servidor, nunca en el bundle cliente.
- Preservar consistencia transaccional e idempotencia en stock, compras, ventas y checkout.
- No hacer cambios de esquema o datos productivos bajo el pretexto de una mejora visual.
- Evitar nuevas dependencias sin justificación; reutilizar componentes y patrones ya existentes.
- Evaluar carga de imágenes, estabilidad visual y tiempos de respuesta; medir antes de fijar metas cuantitativas de rendimiento.
- Confirmar fuente de verdad comercial; **no hardcodear** valores de un caso puntual como si fueran reglas globales.

## 12. Proceso de trabajo ágil por riesgo

**Bajo riesgo (documentación, textos no contractuales, estilos aislados):** inspeccionar → implementar → verificar → commit → informar. Evitar PR innecesarias.  
**Riesgo medio (UI funcional, navegación, nuevos componentes):** inspeccionar flujos → propuesta breve → implementar y probar en rama → verificar con móvil/escritorio → integrar según política vigente.  
**Alto riesgo (precio, descuentos, inventario, ventas, pagos, reservas, DB, Production o Vercel):** preparar y ensayar → evidencia y plan de reversión → **autorización expresa del propietario** para operaciones productivas.

**Regla Git/Vercel:** antes de integrar o desplegar, confirmar que `main` contiene como mínimo las funcionalidades productivas activas y revisar el efecto de builds automáticos. No publicar código anterior por integrar documentación. Documentar y detenerse ante divergencias relevantes.

**No extender autorizaciones:** una aprobación para una tarea no permite cambios productivos distintos ni ajustes no solicitados.

## 13. Definición de terminado (DoD)

Para cada cambio, Codex debe informar de forma breve lo siguiente, usando **Sí / No / No aplica**, con evidencia cuando corresponda:

| Control | Criterio de aceptación |
|---|---|
| Negocio | Se identifica el problema y el beneficio esperado; no se prometen ventas sin medición |
| Identidad | Respeta el manual maestro y los componentes aprobados |
| UX móvil | Se comprueba tarea principal en móvil y escritorio; estados completos |
| Accesibilidad | Foco, teclado, etiquetas, contraste y estados verificables |
| Contenido | Voseo, datos reales, CTA claro, sin afirmaciones inventadas |
| Conversión | Reduce una fricción identificada, sin tácticas engañosas |
| Medición | Evento e indicador definidos; implementados o documentados como pendientes |
| Integridad | Precio, descuentos, variante/SKU, stock, pagos y permisos sin regresión |
| QA | Pruebas pertinentes, errores, vacíos, agotado, carga y navegador revisados |
| Publicación | Riesgo evaluado, efecto de CI/Vercel conocido y autorización adecuada |

Una tarea **no se declara totalmente terminada** si una comprobación aplicable no pasó. Para cambios puramente documentales, las pruebas funcionales pueden marcarse «No aplica» con justificación.

## 14. Plantilla mínima de pedido a Codex

> **Objetivo comercial y usuario:** [qué mejora para quién].  
> **Pantallas o flujos:** [alcance concreto].  
> **Referencia:** leer `AGENTS.md`, `docs/SFSTORE-DIRECTRICES-MAESTRAS.md` y este documento.  
> **Restricciones:** conservar reglas de precio, stock, pago, seguridad y despliegue; no inventar datos.  
> **Entrega:** diagnóstico corto, implementación completa dentro del riesgo autorizado, capturas móvil/escritorio, pruebas y breve informe de decisiones UX/CRO y medición.  
> **Bloqueos:** consultar solo si falta una decisión real de negocio o una autorización de alto riesgo.

## 15. Adopción y mejora continua

**Estado v1.0:** propuesta de estándares, todavía no certifica que la web actual los cumpla. Se convertirá en referencia operativa una vez revisado e integrado con `AGENTS.md`.

**Orden sugerido de aplicación:** (1) auditoría de web y admin; (2) sistema visual y tokens aprobados; (3) fricciones de ficha/variantes y navegación móvil; (4) carrito/checkout; (5) medición y mejora iterativa. Cambiar el orden si evidencia real indica una prioridad distinta.

**Copias y control:** mantener este Markdown versionado en el repositorio y su PDF con igual versión en el proyecto ChatGPT; si el contenido cambia, actualizar ambos y registrar motivo. El manual de redes permanece independiente.

---

**Nota:** No se inspeccionó directamente el código actual ni se auditó la web publicada para redactar v1.0. Los puntos técnicos sobre el Stanley y sincronización de `main` se basan en los informes de ejecución aportados en este proyecto. Toda decisión nueva de interfaz o integración deberá verificarse en el repositorio vigente antes de implementarse.
