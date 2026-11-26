# SFSTORE — MANUAL MAESTRO DE EXPERIENCIA DIGITAL

**Versión:** 1.2 · **Fecha:** 19/11/2026 · **Estado:** Identidad boutique aprobada; despliegue global pendiente · **Ámbito:** tienda online y panel administrador

> **Propósito:** que cada decisión digital en SFSTORE considere simultáneamente identidad de marca, experiencia de usuario (UX), diseño (UI), conversión (CRO), contenido comercial, medición y confiabilidad técnica. Una función que «anda» no está terminada si genera confusión o dificulta vender.

## 01. Alcance y jerarquía

- **Incluye:** inicio, catálogo, categorías, buscador, fichas de productos, variantes, carrito, checkout, consultas, navegación móvil, mensajes transaccionales y panel administrativo.
- **No reemplaza:** *SFSTORE — Manual Maestro de Contenido 2026*, dedicado a redes sociales. La web puede aprovechar aprendizajes de contenido, sin duplicar ese manual.
- **Fuente de verdad comercial:** precios, costos, existencias y operaciones actuales en los sistemas correspondientes. Este documento define criterios; **no inventa datos de productos ni modifica Production**.
- **Precedencia:** seguridad e integridad de datos > condiciones comerciales confirmadas > claridad para el cliente > consistencia visual > preferencias decorativas.

## 02. Identidad y posicionamiento digital

**Promesa:** selección cuidada de perfumes importados y árabes, mates, termos y regalos, con orientación cercana para elegir bien sin gastar de más.

**Sensaciones buscadas:** «qué lindo lugar», «se ve de calidad», «me ayudan a elegir» y «puedo comprar algo bueno sin sentir que es imposible».

**Personalidad visual:** boutique cálida, natural, moderna, argentina y accesible. Referencias: madera natural, verde oliva, marrones, blanco cálido, negro mate y luz cálida como inspiración visual. **No interpretar esto como obligación de usar texturas de madera en cada pantalla.** Evitar blanco frío predominante, dorados excesivos, mármol ostentoso, saturación y efectos que retrasen la navegación.

**Principios:** fotos y productos protagonistas; espacio visual entre elementos; jerarquía clara; contraste legible; accesibilidad; lenguaje argentino con voseo, amable y específico. No usar reclamos vacíos como «calidad premium al mejor precio».

**Decisión vigente del propietario:** toda la tienda pública debe compartir la estética boutique de la ficha de Éclaire y «Sobre este producto» aprobados. Verde oliva, marfil cálido, beige y marrón; hojas fotográficas naturales, luminosas y definidas; bordes suaves, sombras cálidas y profundidad sutil. Los acabados, proporciones y jerarquías forman parte de la identidad: no alcanza cambiar colores en una interfaz antigua. El logo original y las fotografías reales son inalterables salvo autorización expresa. Los códigos de color, tipografía y escala efectivos se obtienen del sistema centralizado en el candidato local, no de valores inventados. La paleta azul es histórica y su sustitución se realiza por etapas con aprobación visual.

**Identidad sin fricción:** el lenguaje boutique debe aportar percepción de calidad y facilitar la compra, no saturar. El espacio entre título, descripción, notas y precios crea orden; la vegetación es secundaria y nunca tapa información. La estructura comercial y los estados aprobados se conservan. Las reglas detalladas de implementación viven exclusivamente en `SFSTORE-ESTANDARES-DISENO-DESARROLLO.md`.

## 03. UX: cómo debe comprar el cliente

1. **Mobile-first:** evaluar primero pantallas chicas y uso táctil; continuar en escritorio. Menús, filtros, selectores y botones deben ser evidentes y utilizables.
2. **Orientación inmediata:** en segundos debe quedar claro qué vende SFSTORE, cómo explorar productos y qué hacer a continuación.
3. **Decisiones simples:** mostrar nombre reconocible, fotografía, precio correcto, disponibilidad real y un CTA principal por contexto.
4. **Sin sorpresas:** explicar diferencias entre precio de lista y efectivo/transferencia, entrega, retiro y condiciones reales antes de confirmar.
5. **Estado visible:** cargando, sin stock, error, producto agregado, pago pendiente y compra completada deben comunicarse con claridad.
6. **Accesibilidad como estándar:** contraste suficiente, foco visible, navegación por teclado, etiquetas, texto alternativo pertinente, estados no dependientes solo del color.
7. **No inventar urgencia:** sin contadores falsos, stock ficticio, reseñas inventadas ni mensajes de escasez sin sustento.

### Recorrido prioritario

**Descubrimiento → categoría/búsqueda → ficha útil → elección de variante → carrito → checkout → confirmación.** Cualquier mejora debe indicar qué fricción específica elimina dentro de ese recorrido.

## 04. UI: componentes y reglas de diseño

- **Sistema consistente:** tokens semánticos centralizados en `storefront-theme.css` y componentes reutilizables; cada componente consume el tema desde su módulo. No duplicar estilos, no aplicar sobrescrituras desde fichas individuales ni reinventar componentes al migrar una página. El mismo sistema debe cubrir descubrimiento, catálogo, ficha, carrito, checkout y páginas informativas; el panel admin conserva sus necesidades operativas.
- **Tarjeta de producto:** imagen nítida, nombre comprensible, precio confiable, estado de stock y acceso claro a detalle. Evitar demasiadas insignias.
- **Ficha:** imágenes suficientemente grandes, precio y variante visibles, descripción con información para decidir, CTA destacado; fotografías reales antes que decoración.
- **Selector de color:** la opción elegida determina el **SKU a comprar**. Al elegir un color cambia la foto principal a la correspondiente; la galería sigue navegable sin cambiar involuntariamente el color seleccionado. Estado agotado visible y compra bloqueada.
- **Carrito:** distinguir variante elegida, cantidad, precio aplicable y subtotal; permitir corregir antes del pago.
- **Responsive:** revisar dimensiones compactas y escritorio, estados de error y cargas lentas. No dar por aprobado un flujo solo por una captura de escritorio.

## 05. Conversión y venta guiada (CRO)

**Principio rector:** ayudar a elegir genera confianza y ventas; no se trata de presionar.

- **Perfumes:** presentar usos, perfil olfativo y orientación según gustos; sugerir decants cuando corresponda para probar antes de comprar. No afirmar notas ni rendimiento no verificados.
- **Mates y termos:** explicar materiales, capacidad, mantenimiento y ocasión de uso; mostrar conjuntos de regalo y complementos realmente compatibles.
- **Regalos:** facilitar la elección por destinatario, presupuesto u ocasión cuando los datos del catálogo lo permitan; dejar claros packaging y personalización disponibles.
- **Venta cruzada:** sugerencias contextuales (mate + bombilla/yerba/termo; perfume + decant/empaque) sin bloquear la compra ni atribuir descuentos no existentes.
- **Confianza:** precio transparente, fotos coherentes, contacto y políticas accesibles, información de entrega verificable.
- **CTA principal por vista:** «Ver opciones», «Elegir color», «Agregar al carrito» o «Consultar», según intención y disponibilidad real.

**Prioridad inicial de mejoras:** navegación móvil, ficha de producto y elección de variantes, claridad del precio, carrito y checkout. El orden definitivo dependerá de auditoría y medición.

## 06. Contenido comercial dentro de la web

**Redactar para responder:** «¿qué es?», «¿para quién?», «¿por qué elegirlo?», «¿qué incluye?», «¿qué variante compro?», «¿cuánto voy a pagar?».

- Títulos con nombre y atributo útil; evitar nombres confusos o todo en mayúsculas.
- Descripciones precisas, escaneables y diferenciadas; beneficios respaldados por atributos reales.
- Ayudas breves cerca del punto de decisión; no esconder condiciones comerciales en textos largos.
- Microcopy con voseo natural y tono confiable. Mensajes de error indican qué pasó y cómo resolverlo.
- Si un dato no existe o no está validado, solicitarlo; **no inventar características, reseñas, promociones ni disponibilidad**.

## 07. Medición y aprendizaje

**Medir decisiones, no solo tráfico.** La instrumentación se implementa luego de auditar qué herramientas y eventos existen realmente; no se presupone que GA4, Meta Pixel u otra plataforma estén instalados.

| Momento del recorrido | Evento conceptual | Qué permite entender |
|---|---|---|
| Explorar catálogo | `view_item_list` / búsqueda | Qué categorías y productos atraen |
| Abrir ficha | `view_item` | Interés real en artículos |
| Elegir variante | `select_item_variant` (evento propio) | Preferencia de color/tamaño y fricción |
| Agregar al carrito | `add_to_cart` | Intención de compra |
| Iniciar pago | `begin_checkout` | Paso hacia conversión |
| Completar compra | `purchase` | Ventas atribuibles sin duplicar |
| Solicitar ayuda | `contact_click` (evento propio) | Consultas iniciadas |

**Reglas analíticas:** documentar disparador, parámetros, consentimiento y fuente; no enviar datos sensibles; deduplicar compras; probar en entorno de pruebas; evitar registrar eventos duplicados en recargas. Revisar métricas por dispositivo, categoría y etapas del embudo cuando haya volumen suficiente. Separar hipótesis de resultados medidos.

**KPIs iniciales:** tasa de vista de ficha sobre sesiones, agregado al carrito sobre vistas de ficha, inicio de checkout sobre carritos, compra sobre checkouts, errores de pago y consultas iniciadas. Definir formalmente denominadores y ventanas antes de comparar.

## 08. Panel administrativo: UX operativa

El panel debe ayudar a operar el local pequeño con rapidez y **minimizar errores que cuestan dinero**.

- Mostrar claramente producto, SKU/variante, stock, costo vigente y precio aplicable; diferenciar inventario físico, reservado y disponible cuando el sistema lo permita.
- Confirmación reforzada para operaciones irreversibles o de alto impacto; validaciones de servidor, permisos y auditoría.
- Formularios claros: campos obligatorios, ayuda contextual, errores accionables, prevención de doble envío y estados de guardado.
- Compras, ventas y ajustes: no duplicar movimientos; conservar fecha comercial, medio de pago, origen y trazabilidad cuando correspondan.
- Historial importado: diferenciar **operaciones históricas** de operaciones actuales; no usar costos actuales para «completar» márgenes históricos faltantes.
- En tareas frecuentes (cobro, búsqueda, empaque), priorizar menos pasos y mayor legibilidad por encima de decoración.

## 09. Calidad técnica y reglas de publicación

SFSTORE utiliza Next.js y Supabase. Mantener controles de autenticación, autorización server-side, protección de rutas, claves privilegiadas fuera del cliente, validación de entradas, consistencia de inventario, idempotencia y revalidación apropiada.

**No romper reglas comerciales existentes:** en ventas locales, el descuento del 25 % se aplica únicamente según las condiciones de cobro confirmadas por el negocio; los cambios sobre pedidos, stock y pagos se prueban como operaciones críticas. Las reservas online no deben eliminarse accidentalmente.

**Mínimos antes de publicar:** comportamiento móvil y escritorio, estados vacíos/error/agotado, accesibilidad básica, precios y redondeos, variantes y SKU, stock y concurrencia, carrito/checkout, eventos analíticos si aplica, pruebas automatizadas relevantes y plan de rollback. Producción requiere autorización cuando corresponda.

## 10. Método obligatorio para nuevas funcionalidades

**A. Brief de una pantalla:** problema del cliente o del operador; objetivo comercial; usuario y contexto; alcance; datos confirmados; restricciones.

**B. Diseño antes de código:** flujo UX, jerarquía visual, microcopy, variantes y estados, criterio de accesibilidad, hipótesis de conversión. Partir de capturas reales y elementos ya aprobados; un mockup de adaptación estética no puede inventar funcionalidades ni cambiar componentes. Entregar prototipos web navegables o vistas previas renderizadas, nunca mockups de interfaz como imágenes. Obtener aprobación del propietario para decisiones visuales nuevas después del control profesional previo definido en Estándares §2.4.

**C. Implementación controlada:** reutilizar patrones y componentes; proteger datos y reglas de negocio; pruebas local/staging.

**D. Verificación:** evidencia visual en celular/escritorio comparada con la referencia aprobada, escenarios funcionales, precio/stock correctos y eventos instrumentados cuando aplique. Comprobar coherencia entre vistas con el sistema compartido antes de presentar; el propietario no debe detectar errores evitables. Separar aprobación técnica de aprobación estética; no cerrar el diseño si el propietario lo rechaza aunque supere todas las pruebas.

**E. Publicación y aprendizaje:** autorización requerida, monitoreo pospublicación, medición con período definido y registro de oportunidades.

### Checklist de aceptación (sí/no/no aplica con evidencia)

1. ¿Se entiende qué hacer y qué se compra?
2. ¿Respeta la identidad visual SFSTORE sin sobrecargar?
3. ¿Funciona con tacto, teclado, móvil y escritorio?
4. ¿Los importes, medios de pago, variantes, stock y mensajes son correctos?
5. ¿La propuesta comercial resuelve una objeción o fricción concreta?
6. ¿El contenido ayuda a elegir y es verificable?
7. ¿Se sabe qué evento o indicador revelará el resultado?
8. ¿Pasaron pruebas de seguridad, integridad y regresión?
9. ¿Hay plan para fallos, reversión y autorización de Production?

## 11. Gobernanza y actualizaciones

- **Documento maestro:** principios estables; cambia solo con decisión explícita del propietario.
- **Estándares de desarrollo:** reglas implementables y específicas de arquitectura; se derivan de este manual.
- **Plan de mejora continua:** backlog vivo de problemas, hipótesis, responsables, resultados y prioridades.
- **Dos copias:** versión Markdown en repositorio y copia Markdown en proyecto ChatGPT. **Entregar un archivo actualizado no carga ni sincroniza automáticamente ninguna de las dos copias.**
- **Versionado:** misma versión interna y fecha en ambas copias; conservar el nombre histórico del adjunto para reemplazarlo sin duplicados. Si difieren, resolver antes de realizar trabajos basados en ellas.
- **Manual de redes:** mantener *SFSTORE — Manual Maestro de Contenido 2026* independiente y referenciado, no duplicarlo.

## 12. Próxima aplicación práctica

1. Usar la ficha de Éclaire aprobada y el sistema centralizado como referencia, preservando las decisiones previas.
2. Migrar las superficies públicas progresivamente: encabezado/navegación, home, catálogo, carrito y checkout; resolver particularidades sin estilos independientes innecesarios.
3. Validar cada etapa con capturas reales y pruebas funcionales; aplicar las exigencias técnicas de los estándares. El encabezado global requiere todavía aprobación de fidelidad estética.
4. Medir antes/después cuando exista instrumentación confiable; nunca prometer resultados de conversión sin datos.

---

**Nota de estado:** esta actualización v1.1 recoge las decisiones visuales del propietario hasta el 19/11/2026. No certifica la implementación publicada, la analítica ni resultados de conversión; verificar cada uno por separado.
