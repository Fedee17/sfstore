# SFSTORE — Plan de Mejora Continua

**Versión:** 1.0 · **Fecha:** 19/10/2026 · **Estado:** propuesta para adopción · **Responsables:** propietario (decisiones comerciales) y Codex (implementación supervisada por riesgo)

**Documentos rectores:** `docs/SFSTORE-DIRECTRICES-MAESTRAS.md` y `docs/SFSTORE-ESTANDARES-DISENO-DESARROLLO.md`. La estrategia editorial de redes sociales se mantiene en su manual independiente.

**Fuente de evidencia inicial:** `docs/auditorias/2026-10-19-AUDITORIA-UX-UI-CRO-MEDICION.md`, auditoría realizada el 18–19/10/2026 sobre `sfstore-ten.vercel.app`. Este plan es un **backlog propuesto**, no constancia de cambios ejecutados. El sitio auditado estaba publicado con el deployment `dpl_6rrP8EnsEJbYmHvKH1kua8zRgBHU`.

> **Objetivo:** que SFSTORE no solo funcione, sino que sea fácil de recorrer desde el celular, facilite la compra guiada, transmita confianza y permita aprender de datos reales sin arriesgar precios, stock, pagos ni ventas.

## 1. Reglas permanentes de mejora

1. **Partir de evidencia.** Registrar problemas observados por navegador (**V**), comprobados en código (**C**) e hipótesis (**H**) por separado. Un efecto esperado en ventas no equivale a un resultado medido.
2. **Atacar fricciones antes de decorar.** Priorizar incoherencias comerciales, identificación del artículo y pasos que impiden decidir. Respetar la estética boutique cálida, accesible y cercana; no imponer una paleta nueva sin aprobación.
3. **Una mejora = una tarea verificable.** Definir objetivo, evidencia, alcance, comportamiento esperado en móvil/escritorio, controles de seguridad y una métrica o prueba de comprensión.
4. **Mantener las reglas comerciales.** No alterar descuentos, medios de pago, reservas, validaciones del servidor, identificadores SKU ni inventario para resolver un problema visual.
5. **Cambios por riesgo.** Codex puede preparar, probar y hacer commits de bajo riesgo; toda publicación que pueda cambiar la web y toda modificación de datos o configuración productiva exige los controles y autorizaciones aplicables. Verificar el efecto de Vercel antes de actualizar `main`.
6. **Medir sin invadir privacidad.** No asumir GA4, Pixel ni consentimiento. No enviar datos personales, comprobantes, mensajes ni credenciales a analítica. El pedido pendiente no es una venta cobrada.
7. **Aprendizaje acumulativo.** Actualizar el estado de las tareas después de cada entrega; actualizar los manuales rectores solo ante decisiones de estándar aprobadas.

## 2. Diagnóstico de referencia: qué encontramos

**Fortalezas a conservar:** categorías y menú móvil funcionales; filtros olfativos ya existentes; selección correcta del SKU de Stanley; variante verde agotada sin compra; carrito que conserva Gris; checkout que bloquea envío sin cotización y valida importes del lado servidor. No reconstruir estos flujos por estética.

**Hallazgos prioritarios:** banner que anuncia «3 cuotas sin interés» aunque el checkout solo permite transferencia; ausencia de imágenes en 31/61 publicaciones de perfumes y 12/33 de artículos materos, incluidos 3/24 perfumes disponibles; ficha familiar de Stanley inicialmente sin fotografía; carrito y checkout sin miniatura de variante; importe de referencia poco protagonista; falta de eventos del embudo encontrados en código.

**Límites de la evidencia:** no se completaron pedidos; no se verificó visualmente el admin autenticado debido al CAPTCHA; no se midieron tasas de conversión reales ni Core Web Vitals de campo. No hay base para prometer un porcentaje de aumento de ventas.

## 3. Backlog inicial priorizado

**Estados admitidos:** Pendiente · Diseño pendiente de aprobación · Listo para desarrollar · En desarrollo · En validación · Publicado · Medido · Bloqueado. **Estado de todas las tareas a 19/10/2026: Pendiente** (sin implementaciones autorizadas por este documento).

| ID | Priorización | Hallazgo y trabajo propuesto | Esfuerzo | Evidencia / aceptación | Verificación de impacto |
|---|---|---|---|---|---|
| **P01** | **P0 — inmediata** | **Banner de cuotas:** reemplazar promesa incompatible por mensaje comercial real aprobado; revisar demás banners, textos alternativos y recorridos de pago. | Bajo | A01 (V). Ninguna pantalla promete cuotas inexistentes; no tocar el checkout ni agregar crédito. | Cero contradicciones en revisión manual; luego consultas por medios de pago. |
| **P02** | **P1 — alta** | **Fotos de artículos comprables:** priorizar los 3 perfumes disponibles sin foto y los destacados; extender por lotes al resto. Verificar correspondencia con artículo y color. | Medio | A02 (V). Publicaciones disponibles prioritarias con foto real aprobada; placeholders honestos donde aún falta material. | % de activos con fotografía; ficha/vista de listado (cuando se mida). |
| **P03** | **P1 — alta** | **Portada de familias:** mostrar fotografía de familia verificada antes de elegir color, sin seleccionar SKU automáticamente; hacer visible selector y precio en móvil. | Medio | A03 (V/C). Foto inicial útil; color explícito obligatorio; galería libre; agotados bloqueados. | Prueba «elegir Gris y agregar»; selección→carrito. |
| **P04** | **P1 — alta** | **Variante confirmable:** miniatura exacta, nombre comercial y «Color: X» en carrito/checkout; SKU secundario, sin alterar IDs. | Medio | A04 (V/C). El cliente identifica artículo/color correcto sin volver a la ficha. | Prueba de comprensión y errores de variante. |
| **P05** | **P1 — alta** | **Resumen de compra claro:** destacar subtotal por transferencia, envío y total cuando sean calculables; diferenciar lo pendiente sin garantizar un importe no confirmado. | Medio | A05 (V). Validación server-side intacta y aviso visible si cambia el total; envío sin cotizar sigue bloqueado. | Comprensión del importe; avance del embudo una vez instrumentado. |
| **P06** | **P1 — habilitadora** | **Analítica mínima:** auditar privacidad y consentimientos; especificar eventos y elegir solución proporcional al volumen; probar deduplicación sin pedidos reales. | Medio | A06 (C/V). Eventos probados, sin datos personales; pago confirmado separado de pedido pendiente. | Cobertura de eventos y conciliación con transacciones. |
| **P07** | **P2 — media** | **Catálogos móviles:** acortar introducciones; acercar filtros y primeros artículos; evaluar filtro «disponibles» y precio reutilizando filtros existentes. | Bajo/medio | M01/M02 (V/C). Sin ocultar artículos ni cambiar inventario automáticamente. | Scroll hasta primer artículo; éxito al encontrar disponible. |
| **P08** | **P2 — media** | **Contenido útil por categoría:** revisar primero títulos, atributos y descripciones de productos activos; perfumes con notas verificadas, mates con material/capacidad; ficha familiar con información y relacionados coherentes. | Medio | M03/M06 (V/C). Sin afirmaciones inventadas ni recomendaciones incompatibles. | Cobertura de fichas verificadas y consultas recurrentes. |
| **P09** | **P2 — media** | **Confianza y ayuda:** FAQ concreta sobre transferencia, confirmación, retiro, envío y cambios, solo tras aprobación de condiciones reales; aclarar qué abre WhatsApp en Regalos. | Medio | M04/M07 (V/C). Nada que prometa un servicio inexistente. | Dudas repetidas, clics de ayuda y contacto. |
| **P10** | **P2 — media** | **Accesibilidad/semántica:** nombrar controles de cantidad, mejorar objetivo táctil «Vaciar», H1 textual y alternativa del banner; corregir cadena UTF-8. | Bajo/medio | M05, B01, B02 (V/C). Teclado/foco/lectura y mobile sin regresiones. | QA accesible y cero textos mal codificados. |
| **P11** | **P2 — validación previa** | **Administrador:** resolver acceso autorizado para auditoría visual; evaluar navegación, familias, compras, ventas y Analytics antes de rediseñarlos. | Pendiente | ADM01–06 (C, hipótesis); acceso bloqueado por CAPTCHA durante auditoría. No desactivar protección. | Tiempos y errores de tareas operativas observadas. |
| **P12** | **P3 — posterior** | **Sistema visual:** inventariar tokens UI pública/admin y proponer alternativas compatibles con SFSTORE; medir contraste y rendimiento antes de decidir rediseño global. | Medio | M08 + sección de accesibilidad/rendimiento (C/H). Paleta/tipografías definitivas pendientes de aprobación. | Consistencia, comprensión, contraste y métricas reales de rendimiento. |

**Notas de prioridad:** P0 requiere atención comercial inmediata; P1 reúne fricciones comprobadas y medición necesaria. P02 depende de contar con fotos reales; P06 depende de definir privacidad y criterio de conversión. P11 no autoriza saltar CAPTCHA ni modificar datos.

## 4. Secuencia de entregas recomendada

**Entrega 0 — coherencia y confianza:** P01 y corrección UTF-8 de P10. Aprobación de texto/banner antes de publicar; comprobación visual en móvil/escritorio, checkout sin cambios funcionales.

**Entrega 1 — primer contacto con productos:** P02 (empezando por disponibles/destacados), P07 y H1 de P10. No esperar a tener fotos de todo el catálogo para mejorar los productos vendibles prioritarios.

**Entrega 2 — decisión y compra:** P03 → P04 → P05. Revisar la tarea completa «elijo Gris, veo foto correcta, reconozco Gris en carrito, entiendo qué pagar y cuándo». Conservar validaciones del servidor, descuentos e idempotencia.

**Entrega 3 — medición:** P06 puede diseñarse en paralelo desde ahora, pero solo activarse con esquema, consentimiento y pruebas aprobados. Establecer línea de base antes de atribuir resultados de los cambios anteriores.

**Entrega 4 — confianza y operación:** P08, P09 y P11, luego P12 con alternativas visuales reales para aprobar; ajustar el orden según evidencia nueva.

## 5. Marco de medición (propuesta, no instalado)

| Etapa | Evento sugerido | Regla que impide datos engañosos |
|---|---|---|
| Lista/catálogo | `view_item_list` | No registrar cada rerender como nueva impresión. |
| Ficha | `view_item` | Identificar familia/producto sin duplicar por cambio de foto. |
| Variante | `select_item_variant` | Solo elección deliberada; pasear galería no equivale a seleccionar. |
| Carrito | `add_to_cart` | Solo después de agregado exitoso, con SKU y moneda. |
| Checkout | `begin_checkout` | Deduplicar intentos definidos. |
| Pedido | `order_pending_transfer` (conceptual) | Pedido creado no significa dinero recibido. |
| Pago confirmado | `purchase` o evento equivalente aprobado | Solo en confirmación autorizada, ID estable y deduplicación. |
| Consulta | `contact_click` | Medir origen sin capturar conversación ni teléfono. |

**Indicadores:** vistas de ficha / impresiones de lista; agregados / vistas de ficha; inicios de checkout / carritos; pedidos / inicios de checkout; cobros confirmados / pedidos. Definir período, dispositivo y exclusión de pruebas; evitar conclusiones estadísticas por muestras pequeñas. La medición de negocio en admin y la de navegación son complementarias, no intercambiables.

**Antes de implementar:** revisar herramientas ya instaladas y acceso a plataformas externas, consentimiento y privacidad aplicables, política de retención, esquema de eventos y reconciliación. No capturar PII ni disparar compras ficticias.

## 6. Ficha breve por tarea y definición de terminado

**Plantilla para abrir trabajo en Codex:** `ID · usuario afectado · evidencia V/C/H · problema · resultado comercial/UX esperado · pantallas · datos confirmados · propuesta UI/microcopy · riesgos de precio/stock/pago/seguridad · pruebas móvil/escritorio · métrica o prueba de comprensión · autorización requerida`.

**Se considera lista para publicar** cuando: se verificó el objetivo; la interfaz móvil/escritorio y los estados vacíos/error/agotado; accesibilidad pertinente; copy aprobado y veraz; contratos de SKU/precio/stock intactos; pruebas aplicables aprobadas; estrategia de observación definida; efecto de Vercel conocido y autorización de publicación cuando corresponda. **«Funcionó técnicamente» no basta.**

**Después de publicar:** guardar fecha/commit/deployment, evidencia antes/después, eventuales incidencias y resultado medido (o «sin instrumentación / muestra insuficiente»). Cerrar como «Medido» solo con datos verificables; nunca inventar aumento de conversión.

## 7. Registro vivo de decisiones y seguimiento

| Fecha | ID | Estado | Decisión / evidencia nueva | Commit o deployment | Resultado / próximo control |
|---|---|---|---|---|---|
| 19/10/2026 | P01–P12 | Pendiente | Backlog creado a partir de auditoría pública y revisión de código. | Sin cambios de código | Priorizar P01; completar validación visual admin cuando exista sesión válida. |

**Regla de mantenimiento:** Codex actualiza esta tabla y el estado de una tarea en el mismo cambio documental correspondiente, sin reescribir las decisiones históricas. Si un dato comercial cambia, verificar la fuente actual antes de actuar. Revisar prioridades después de cada entrega importante y al disponer de medición confiable.

## 8. Custodia y alcance

- **Versión editable principal:** `docs/SFSTORE-PLAN-MEJORA-CONTINUA.md` en el repositorio; **copia de consulta:** PDF v1.0 en el proyecto ChatGPT SFSTORE.
- Conservar el informe original de auditoría y las capturas como **evidencia**, preferentemente en su carpeta de auditoría. Este plan referencia hallazgos: no suplanta el informe ni certifica visualmente el administrador.
- Para las decisiones maestras y cambios de identidad, prevalecen los dos documentos rectores y la aprobación del propietario.
- **Adoptar este plan no autoriza ejecutar P01–P12**, cambiar Production, conectar plataformas de analítica o modificar datos de ventas/inventario.

---

**Próxima decisión comercial sugerida:** aprobar una nueva comunicación para reemplazar el banner de «3 cuotas sin interés» por un mensaje verdadero y claro sobre el pago actual, antes de ordenar cambios visuales más amplios.
