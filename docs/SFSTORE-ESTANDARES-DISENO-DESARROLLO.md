# SFSTORE — ESTÁNDARES DE DISEÑO Y DESARROLLO

**Versión:** 1.3 · **Fecha:** 20/11/2026 · **Estado:** Estándar vigente de identidad boutique; migración global en curso  
**Ámbito:** tienda online, experiencia móvil, checkout y panel administrador  
**Documento rector:** `docs/SFSTORE-DIRECTRICES-MAESTRAS.md` (Manual Maestro de Experiencia Digital, versión interna 1.2)

> **Regla central:** una funcionalidad está lista cuando funciona, se entiende, respeta la identidad de SFSTORE, facilita el objetivo del usuario y puede verificarse sin poner en riesgo operaciones reales.

## 1. Propósito, alcance y precedencia

Este documento convierte las directrices maestras en **criterios de implementación y aceptación** para Codex. No autoriza por sí mismo cambios en Production, datos, precios, inventario o procesos de pago.

- **Incluye:** UI, UX, contenido comercial web, conversión, medición, accesibilidad, rendimiento, panel admin, QA y entregas.
- **Excluye:** estrategia editorial detallada de Instagram y TikTok, definida en el *Manual Maestro de Contenido SFSTORE 2026*.
- **Prioridad ante conflictos:** integridad y seguridad de datos → decisiones comerciales confirmadas → claridad y accesibilidad → UX y conversión → consistencia visual.
- **Distinción obligatoria:** **confirmado**, **propuesto** y **pendiente de verificar**. Codex no debe convertir hipótesis de diseño, costos, datos de producto o métricas en hechos.

## 2. Identidad UI: sistema antes que pantallas

**Estilo aprobado:** boutique cálida, natural, moderna, cercana y premium accesible. La referencia digital es la ficha de Éclaire aprobada, especialmente «Sobre este producto» y el bloque superior de información comercial. El azul histórico deja de ser la identidad objetivo del storefront. **No inventar códigos HEX ni una tipografía nueva:** extraer los valores efectivos de los componentes aprobados y `storefront-theme.css` en el candidato local. El archivo centralizado existe según el informe de Codex; verificar su ubicación y versión antes de editar.

### 2.1 Lenguaje visual obligatorio

| Elemento | Criterio |
|---|---|
| Fondo general | Marfil cálido, transiciones delicadas hacia beige, sin gris frío ni texturas recargadas. |
| Superficies | Marfil y beige suaves; bordes delicados cálidos, radios coherentes y sombras sutiles. |
| Verde oliva | Color principal de encabezados, enlaces y CTA; tonos claros para etiquetas y fondos, contraste suficiente. |
| Texto | Marrón muy oscuro o tono aprobado equivalente; oliva para marca y acentos. |
| Profundidad | Degradados y sombras discretos para botones y superficies, evitando efecto plano o brillo artificial; no aplicar por igual a todo. |
| Vegetación | Hojas fotográficas naturales, verdes, luminosas y definidas, entrando desde esquinas o integradas al fondo; sin cajas visibles, desenfoques genéricos ni siluetas planas. |
| Jerarquía | Marca secundaria, nombre protagonista, interlineado cómodo y grupos separados; evitar amontonar etiquetas, precios y CTA. |
| Iconos | Trazo coherente, color contextual, tamaño legible, significado claro. Conservar colores de marca cuando corresponda (logo y WhatsApp). |
| Fotografía | Producto real protagonista. No regenerar fotos del catálogo ni deformar o cortar envases para llenar un marco. |

La decoración botánica es un recurso compartido y opcional según la superficie, no una obligación en cada tarjeta. Reutilizar los dos WebP existentes cuando cumplan la referencia; si el recurso no es fiel, sustituirlo de forma controlada, optimizada y previa aprobación visual. No introducir imágenes pesadas ni animaciones ornamentales que degraden rendimiento.

### 2.2 Arquitectura del tema

- `storefront-theme.css` es la fuente de verdad del tema público: tokens semánticos de color/superficie/texto/acciones/estados, tipografía, espaciados, radios, sombras y referencias botánicas. Reutilizar los valores aprobados; no duplicar literales por página.
- Los componentes compartidos (SiteHeader, buscador, navegación, tarjeta de producto, galería, precios, badges, CTA, desplegables, formularios, avisos, carrito y totales) consumen tokens y definen sus estilos desde su propio módulo. Una ficha no puede sobrescribir externamente el header ni controlar estilos de otros componentes.
- Preferir reutilización y variantes justificadas; no clonar componentes ni introducir una biblioteca nueva sin necesidad. Separar presentación de datos, lógica comercial y estados. El tema del storefront no debe alterar involuntariamente el panel admin.
- La migración se activa de forma controlada por contenedor cuando sea necesario. Es una transición, no la arquitectura final: todas las páginas públicas deberán compartir el mismo lenguaje visual, incluidos checkout y su encabezado propio, respetando las diferencias funcionales.
- Para refactors sin cambio visual, comparar capturas antes/después con datos, viewport y estados equivalentes; buscar coincidencia píxel por píxel donde sea razonable. Para cambios estéticos, comparar contra el mockup y capturas reales aprobados. Registrar diferencias justificadas y no ampliar alcance.

### 2.3 Referencia visual y control de cambios

La ficha de Éclaire aprobada y su composición «Sobre este producto» son la referencia de identidad, no un permiso para copiar literalmente su estructura a otras categorías. Usar las capturas vigentes del candidato local y los mockups aprobados de escritorio, móvil e información comercial (cuatro notas ilustradas). El mockup no sustituye datos, precios, recursos ni lógica real. Las comparativas de Codex están referenciadas en el documento de continuidad.

**Regla de aceptación estética:** una recoloración del diseño anterior no constituye una adaptación completa. Deben coincidir proporciones autorizadas, jerarquía, espaciado, acabados y tratamiento de los recursos naturales. La primera versión del encabezado del 19/11 fue rechazada; usar el candidato corregido descrito en Continuidad, no una versión rechazada.

**Reglas operativas:**

1. Utilizar **tokens reutilizables** para colores, tipografía, espaciados, radios, sombras y estados; evitar valores repetidos por pantalla.
2. Mantener jerarquía consistente: título claro, precio y disponibilidad visibles, CTA primario distinguible; los productos y sus fotografías dominan la composición.
3. El espacio en blanco es funcional: agrupa decisiones y mejora lectura. Evitar tarjetas saturadas, carruseles superpuestos, exceso de insignias, dorados, mármol y efectos decorativos.
4. No sustituir fotos reales de producto por elementos generados o genéricos sin autorización. No alterar visualmente el color o presentación de un artículo.
5. Establecer estados visuales coherentes para **normal, hover, foco, seleccionado, deshabilitado, cargando, éxito y error**. No indicar estados solo mediante color.
6. Cualquier cambio de paleta, logo, tipografía principal o patrón global requiere propuesta comparativa y aprobación del propietario.

**Componentes a normalizar al auditar:** encabezado y navegación móvil, buscador, tarjeta, galería, selector de variantes, precio, CTA, badges, formulario, resumen de compra, mensajes de estado, tablas y filtros del admin. Reutilizar antes de duplicar.

### 2.4 Protocolo de prototipos web y control profesional (obligatorio)

1. Inventariar referencias, componentes y tokens reales del candidato; identificar alcance autorizado y cambios paralelos. La ficha de Éclaire implementada es la referencia estética; un boceto de otra página sólo define distribución autorizada.
2. Construir el mockup como interfaz HTML/CSS/JS renderizada o vista previa del componente real, preferentemente en el candidato local aislado. Reutilizar tipografía, SiteHeader, tarjetas, precios, CTA, iconos y tokens. No crear un segundo sistema visual, ni una captura incrustada que simule una interfaz. Usar datos de prueba identificados cuando no haya datos reales disponibles. No conectar operaciones reales al prototipo.
3. Entregar un enlace de vista previa local o un prototipo web autocontenido ejecutable, con navegación/interacciones pertinentes; comprobar a 320, 390, 768 y 1366 px según alcance. Las capturas son evidencia complementaria, nunca el mockup principal. No desplegar públicamente sin permiso. Si no se dispone del candidato o de navegador, declarar qué no se pudo comprobar; no presentar una imagen generada como sustituto.
4. Antes de entregar, comparar lado a lado las vistas reales de home, ficha y componentes afectados: familia y pesos tipográficos, tokens efectivos, jerarquía, radios, sombras, iconos, espaciado, precios/ahorro, estados, fotos, recortes, contraste y ausencia de desbordamientos. Verificar variantes, nombres largos y agotados cuando corresponda. Corregir discrepancias no autorizadas antes de solicitar aprobación. Registrar evidencia de controles pertinentes, sin repetir auditorías ajenas al cambio.
5. El propietario aprueba decisiones visuales/comerciales, no realiza el control de calidad del agente. Ninguna propuesta incoherente se considera lista por pasar pruebas técnicas. No prometer equivalencia sin verificarla.

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

### 4.1 Encabezado compartido

Conservar el logo circular original, buscador visible, categorías, carrito, comportamiento responsive y menús accesibles. Usar oliva con profundidad sutil, buscador marfil con borde cálido e icono oliva, carrito con acabados del sistema, tipografía y separación coherentes con la ficha. Incorporar vegetación natural con moderación cuando no afecte lectura ni controles. No sustituir la navegación real por hamburguesa, cuenta o categorías nuevas que aparezcan solo en el mockup. La apariencia debe validarse sobre home, catálogo y ficha; el encabezado propio del checkout se adapta en su etapa.

### 4.2 Contrato de la home (decisión del 19/11)

Conservar la distribución seleccionada de «¿Qué estás buscando?», «Los más elegidos de SFSTORE» y «Ritual Matero»; adaptar sus acabados a los componentes reales de la ficha. Mantener intactos los banners y «¿Qué estás buscando?», incluidas sus fotografías ambientadas. «Los más elegidos de SFSTORE» y «Ritual Matero» muestran el packshot aprobado de cada producto sobre la superficie de tarjeta, sin recortes desprolijos, según la [regla de imágenes de producto](#51-fuente-compartida-de-imágenes-de-producto). Mientras un producto no tenga packshot aprobado, la tarjeta usa su fotografía real actual como respaldo temporal (decisión del 20/11), nunca un marcador «Imagen no disponible» ni una imagen ambiental. No aplicar fondos fotográficos al bloque de productos. Conservar títulos, descripciones breves y datos reales; reutilizar el precio/ahorro en variante compacta, sin duplicar cálculos. Mantener el encabezado vigente y no modificar secciones restantes sin autorización.

## 5. Catálogo y tarjetas de producto

Una tarjeta aprobada permite reconocer **producto, variante si aplica, precio aplicable, disponibilidad** y siguiente acción sin abrir múltiples vistas.

- Fotografía nítida, recorte consistente y proporciones cuidadas sin ocultar atributos relevantes.
- Nombre reconocible; no saturar con descripciones largas ni badges acumulados.
- Si se muestran dos precios, **etiquetar explícitamente** el precio de lista y el de efectivo/transferencia; no inducir a pensar que todo medio de pago recibe descuento.
- No mostrar un precio promocional ficticio ni usar precio tachado si no corresponde a una comparación comercial legítima.
- Agotado y no disponible deben distinguirse cuando el sistema contemple esos estados.
- Los filtros por categoría, marca, uso o atributo deben reflejar datos realmente disponibles y consistentes; no inventar taxonomías.

### 5.1 Fuente compartida de imágenes de producto

- Una vez que ChatGPT genere los recursos y el propietario los apruebe visualmente, asignar la nueva imagen individual aprobada como principal del producto y de cada variante aplicable. Antes de aprobarla, cotejar con las fotos reales la identidad, presentación, proporciones, etiqueta y color. Hasta la aprobación de cada recurso, conservar la asignación actual.
- Usar una única fuente de imágenes del catálogo para «Los más elegidos de SFSTORE», «Ritual Matero», catálogo, galería de la ficha, carrito y checkout. Cada recurso se guarda una sola vez y se reutiliza por referencia. Registrar cada asociación entre imagen e identidad una sola vez en la fuente compartida. Evitar archivos copiados, mapas de imágenes por pantalla o asociaciones duplicadas.
- Resolver la principal con el identificador del producto o de la variante exacta cuando se conoce su SKU. Asociar un mismo recurso a varias identidades sólo si representa fielmente a cada una. Evitar inferencias por nombre, posición en la galería o similitud visual. El carrito y el checkout resuelven la imagen del SKU de la línea.
- Conservar las fotografías reales actuales como imágenes secundarias de la galería, incluidas las que dejen de ser principales. Preservar sus asociaciones con el producto o variante y su orden relativo.
- Antes de dar por implementado un lote, comprobar que las superficies incluidas resuelven la misma imagen para la misma identidad, que el cambio de variante muestra su imagen correspondiente y que las fotografías reales siguen disponibles en la galería.

**Fotografías comerciales generadas con IA (procedimiento obligatorio, 20/11).**

- **Regla fundamental:**
  - Toda imagen generada parte de referencias visuales de productos reales de SFSTORE. Se usan fotografías del catálogo o tomas propias verificadas.
  - El producto conserva fielmente forma, proporciones, colores, materiales, etiquetas, marcas, tapas, costuras, grabados y demás características.
  - La IA puede crear una ambientación fotográfica nueva, pero no puede rediseñar, simplificar, inventar ni sustituir productos, envases o packaging.
  - No se generan imágenes sólo a partir de texto, ni con productos genéricos o sin marca que representen a SFSTORE.
- **Tipos de imagen** (no se mezclan):
  - **Packshot individual:** producto y su caja cuando corresponda, sobre fondo transparente y sin escenario. Es la imagen principal objetivo del producto o variante, según las reglas anteriores de esta sección.
  - **Fotografía real de respaldo:** la fotografía real actual del catálogo, tal como existe. Ocupa el lugar del packshot en tarjetas, galería, carrito y checkout mientras el producto no tenga packshot aprobado (ver 4.2). Es temporal, no se edita ni se regenera, y queda como secundaria en la galería cuando llega el packshot.
  - **Fotografía ambiental:** productos reales recreados mediante IA dentro de una escena natural y coherente con SFSTORE. Se usa en banners, secciones editoriales y la navegación de la home. Nunca reemplaza al packshot ni a la fotografía real de respaldo, y no se asigna como imagen de catálogo, carrito o checkout.
- **Criterio estético de la escena:**
  - Priorizar luz cálida creíble, madera, vegetación natural, profundidad de campo moderada y materiales auténticos.
  - Evitar renders artificiales, atardeceres exagerados, acabados plásticos o brillantes, escenarios excesivamente perfectos y objetos de utilería inventados que compitan con el producto, como cajas o moños ajenos al packaging real.
  - El producto sigue siendo el protagonista.
- **Flujo obligatorio:** se cumple con los subagentes existentes (`.codex/agents/` y sus equivalentes en Claude Code). Ningún paso lo revisa el mismo agente que lo produjo.
  1. **Investigación de referencias.** `sfstore-product-researcher` confirma el SKU o la variante exacta y reúne las fotografías auténticas de referencia, con su origen. Sin referencias verificadas, el encargo no avanza.
  2. **Generación.**
     - `sfstore-perfume-photographer` (perfumes y decants) o `sfstore-product-photographer` (mates, termos y accesorios) generan candidatos a partir de esas referencias. Sólo con encargo explícito del propietario.
     - Registran las referencias usadas, el tipo de recurso y el destino previsto.
     - Trabajan fuera del código y del catálogo.
  3. **Revisión independiente.**
     - `sfstore-image-reviewer` coteja cada candidato con las referencias reales: identidad, proporciones, etiqueta, color, materiales, artefactos y criterio estético.
     - Cuando el recurso va a una superficie concreta, `sfstore-design-reviewer` valida su integración con el sistema boutique.
  4. **Aprobación visual del propietario** con el candidato aprobado por la revisión, mostrado en su contexto real.
- **Rechazo y sustitución:**
  - Una imagen que no supera la revisión se rechaza y no se presenta como opción ni se integra. Esto incluye diferencias de etiqueta, forma, color o marca, productos inventados y acabado de render.
  - Ningún recurso generado sustituye una fotografía existente sin la aprobación visual expresa del propietario. Hasta entonces se conservan la asignación y los archivos actuales.

## 6. Ficha de producto y selección de variantes

**Foco comercial:** ayudar a elegir, no solo mostrar especificaciones. Orden recomendado de información: nombre → imágenes → precio → disponibilidad → decisión de variante/cantidad → CTA → atributos y descripción útiles. Ajustar tras pruebas reales.

### 6.1 Contrato visual de ficha boutique

- Galería: mostrar primero la imagen principal aplicable y mantener las fotografías reales como secundarias según la [regla de imágenes de producto](#51-fuente-compartida-de-imágenes-de-producto). Mostrar la imagen completa, centrada y sin distorsión; en escritorio aprovechar el ancho y colocar las miniaturas en columna izquierda; en móvil miniaturas horizontales debajo. Flechas circulares marfil, foco visible y navegación existente. No rellenar con franjas grises o fondos desenfocados ni recortar para simular una foto horizontal. La proporción real de la imagen tiene prioridad.
- Información comercial de perfumes: marca oliva separada, nombre oscuro protagonista con línea verde corta, descripción breve con interlineado cómodo, hasta cuatro notas representativas documentadas con ilustraciones específicas reutilizables. Espaciado orientativo de 16–24 px entre grupos, ajustable a la resolución; no imponerlo si causa overflow. Todas las notas permanecen disponibles en «Sobre este producto».
- Precio: preservar lista tachada, indicación del descuento y medios aplicables, panel de precio final + ahorro con divisor e icono, según el componente existente. Precio y ahorro en la misma fila en escritorio; adaptar en móvil sin cortes. No hardcodear los montos de los mockups ni añadir selector de cantidad si no existe.
- Acciones: «Agregar al carrito» de ancho completo y «Consultar por WhatsApp» debajo; conservar estados de compra, agotado, confirmación y comportamientos ya aprobados. No agregar favoritos ni calificaciones ficticias.
- «Sobre este producto»: mantener diseño de encabezado oliva con vegetación, composición de tres ingredientes documentados sobre madera/naturaleza sin frasco repetido, descripción y recomendación breve, perfil e ideal para, pirámide ilustrada alineada por niveles y acordes con fuente. Respetar la disposición móvil aprobada: tarjetas apiladas, notas legibles y título de acordes encima de barras. Mostrar intensidad solo si está respaldada; barras de predominancia relativa documentada (no porcentajes químicos ni duración/proyección). Si las fuentes no permiten asignar niveles o longitudes, mostrar solamente las notas/acordes verificables, sin inventar. Ocultar opiniones propias vacías hasta contar con reseñas reales.
- Validar la regla para todas las fichas de la categoría: controles automáticos de datos, imágenes y responsive en todo el catálogo, y revisión visual representativa de nombres largos, estados, variantes y casos excepcionales. No confundir pasar una muestra con auditar el 100 %.

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

- Presentar cada línea con producto, **variante exacta**, imagen principal resuelta según la [regla de imágenes de producto](#51-fuente-compartida-de-imágenes-de-producto), cantidad, precio unitario y subtotal.
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

**Bajo riesgo (documentación, textos no contractuales, estilos aislados):** inspeccionar → implementar → verificar → informar; commit solo con autorización correspondiente. Evitar PR innecesarias.  
**Riesgo medio (UI funcional, navegación, nuevos componentes):** inspeccionar flujos → propuesta breve → implementar y probar en rama → verificar con móvil/escritorio → integrar según política vigente.  
**Alto riesgo (precio, descuentos, inventario, ventas, pagos, reservas, DB, Production o Vercel):** preparar y ensayar → evidencia y plan de reversión → **autorización expresa del propietario** para operaciones productivas.

**Regla Git/Vercel:** antes de integrar o desplegar, confirmar que `main` contiene como mínimo las funcionalidades productivas activas y revisar el efecto de builds automáticos. No publicar código anterior por integrar documentación. Documentar y detenerse ante divergencias relevantes.

**No extender autorizaciones:** una aprobación para una tarea no permite cambios productivos distintos ni ajustes no solicitados.

## 13. Definición de terminado (DoD)

Para cada cambio, Codex debe informar de forma breve lo siguiente, usando **Sí / No / No aplica**, con evidencia cuando corresponda:

| Control | Criterio de aceptación |
|---|---|
| Negocio | Se identifica el problema y el beneficio esperado; no se prometen ventas sin medición |
| Identidad | Prototipo web renderizado y comparación entre vistas reales y referencias aprobadas (control §2.4): paleta, jerarquía, espaciado, acabados, recursos y estructura conservada; no basta recolorear. Aprobación visual expresa del propietario para cerrar |
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

**Estado v1.1:** criterios de identidad y arquitectura aprobados; no certifica la publicación ni la aprobación visual de todos los componentes. Incorporar las reglas a `AGENTS.md` mediante el procedimiento autorizado de Codex.

**Orden de aplicación vigente:** (1) fijar referencia visual y funcional → (2) centralizar el tema sin regresiones → (3) encabezado/navegación, home y catálogo por etapas → (4) carrito lateral y página de carrito juntos → (5) checkout y su encabezado propio → (6) verificación integral y publicación autorizada. El estado concreto se consulta en continuidad y el backlog canónico de repositorio, no se duplica aquí.

**Copias y control:** mantener el Markdown en el repositorio y en el proyecto ChatGPT con igual versión interna. Se conserva el nombre histórico del adjunto (`v1.0`) para sustituirlo sin duplicados; la cabecera interna define la versión vigente. Sincronizar con Codex y registrar cambios. El manual de redes permanece independiente.

---

**Nota de evidencia:** actualización basada en las decisiones del propietario, mockups/capturas y reportes de Codex aportados hasta el 19/11/2026; no supone inspección directa del candidato local ni certificación de Production. Verificar los valores efectivos, archivos, recursos y pruebas en el repositorio antes de actuar.
