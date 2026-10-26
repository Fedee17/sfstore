# SFSTORE — Plan de Mejora Continua

**Versión:** 1.0 · **Fecha:** 19/10/2026 · **Estado:** propuesta para adopción · **Responsables:** propietario (decisiones comerciales) y Codex (implementación supervisada por riesgo)

**Seguimiento vigente:** sección 9, actualizada el 26/10/2026. Los registros anteriores se conservan como antecedentes fechados.

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

| 19/10/2026 | P14 · componentes | En desarrollo | Conciliador de costos de cargadores y simulación en Compras: reparto proveedor 50/50 y envío entre 49 piezas, reclasificación compensada y residuales; compra original intacta. | Rama local `codex/charger-components-20261019`, sin publicación | Tests sintéticos y validación técnica; conversión persistente/combos aún no implementados, precios pendientes. Ver `docs/CHARGER-COMPONENT-COST-RECONCILIATION.md`. |
| 19/10/2026 | P14 · motor y combos | En validación | Continuación de `053aebf`: conversión/reversión auditables, recepción por conector, selección de dos SKU reales en mostrador y carrito, reserva compartida, bloqueo separado por aprobación de precios. | Misma rama local, sin aplicación productiva ni publicación | PostgreSQL17.6 descartable, pruebas de aplicación, TypeScript, lint y build; precios pendientes, preflight fresco y revisión visual antes de publicar. Ver `docs/CHARGER-COMPONENT-INVENTORY.md`. |
| 20/10/2026 | P14 · precio especial de combo | Implementado localmente, sin publicar | Precio aprobado $23.000 efectivo/transferencia ($30.666,67 lista), una selección con cable explícito, expansión a SKU físicos y stock compartido; auditoría de precio, snapshots y devoluciones de pares sin reembolso automático. | `codex/charger-components-20261019`, sin push ni cambios productivos | Pruebas de precios, concurrencia, reservas, cancelaciones e historial en PostgreSQL aislado; revisión visual y circuito Auth/PostgREST pendientes. Ver `docs/CHARGER-COMBO-PRICING.md`. |
| 20/10/2026 | P14 · validación integrada final | Validado por HTTP/Auth/PostgREST, sin publicar | Compras por conector, ventas con pagos combinados, carrito real, checkout, reintentos, acreditación y controles de autorización en base de negocio descartable. | Continuación local de `259d83e`, sin cambios productivos | 12 tests integrados aprobados; revisión visual bloqueada por restricción de navegador, token nuevo de Turnstile no probado; respaldo/preflight fresco y autorización antes de publicar. Ver `docs/CHARGER-COMBO-FINAL-VALIDATION.md`. |

| 20/10/2026 | P14 · candidato acotado y corte | Preparado localmente, sin publicar | Rama de publicación sin rentabilidad; bloqueo por SKU, conversión y precios en transacción, recuperación condicionada; IDs nuevos generados por la base. | `codex/charger-components-release-20261020` | 9 pruebas específicas del corte, build y tipos; visual pendiente, autorización productiva y actor por vincular. Ver `docs/CHARGER-RELEASE-RUNBOOK.md`. |

| 21/10/2026 | P14 · cinco presentaciones | En validación local | Tres SKU físicos y dos publicaciones virtuales diferenciadas de cargador completo, con URL/búsqueda/mostrador propios; una receta, precio especial y stock compartido existentes. Incluye correcciones visuales de precio/selector y revisión notebook/móvil con datos sintéticos. | Candidato local, sin publicación | Ver `docs/CHARGER-COMMERCIAL-PRESENTATIONS.md`; no se modificaron Production, costos ni SQL. |

| 21/10/2026 | P14 · seguridad conjunta de catálogo/ofertas | Integrado localmente, sin publicar | Tercera migración con bytes exactos validados; vistas invocadoras, grants por columna, proyección pública por conector sin costos ni stock persistido. Recetas y auditorías privadas. | Candidato derivado de `3dc2e92` | 53 controles previos reutilizados y 19 pruebas focalizadas de integración aprobadas en PostgreSQL 17.6, sin omisiones. Ver runbook; requiere autorización del nuevo candidato/DDL y control de Vercel antes del corte. |

**Regla de mantenimiento:** Codex actualiza esta tabla y el estado de una tarea en el mismo cambio documental correspondiente, sin reescribir las decisiones históricas. Si un dato comercial cambia, verificar la fuente actual antes de actuar. Revisar prioridades después de cada entrega importante y al disponer de medición confiable.

## 8. Custodia y alcance

- **Versión editable principal:** `docs/SFSTORE-PLAN-MEJORA-CONTINUA.md` en el repositorio; **copia de consulta:** PDF v1.0 en el proyecto ChatGPT SFSTORE.
- Conservar el informe original de auditoría y las capturas como **evidencia**, preferentemente en su carpeta de auditoría. Este plan referencia hallazgos: no suplanta el informe ni certifica visualmente el administrador.
- Para las decisiones maestras y cambios de identidad, prevalecen los dos documentos rectores y la aprobación del propietario.
- **Adoptar este plan no autoriza ejecutar P01–P12**, cambiar Production, conectar plataformas de analítica o modificar datos de ventas/inventario.

---

**Próxima decisión comercial sugerida:** aprobar una nueva comunicación para reemplazar el banner de «3 cuotas sin interés» por un mensaje verdadero y claro sobre el pago actual, antes de ordenar cambios visuales más amplios.


### 22/10/2026 — Experiencia de compra: implementación local

P01, P05 y P08: **En validación local; no publicado**. Rama `codex/charger-purchase-ux-20261022`, basada en `5884b0e`. Se elimina la promesa visual de cuotas de los banners públicos, se separa la sección Accesorios de la taxonomía matera y se priorizan precio, conector y compra en móvil. Carrito y checkout usan el cálculo unitario por transferencia existente y conservan el bloqueo de envío sin cotizar. No cambia inventario, precios, descuentos ni autorización del servidor.

Evidencia y límites: [revisión comparativa](auditorias/2026-10-22-MEJORAS-EXPERIENCIA-COMPRA.md). Fotografías y especificaciones verificadas de cargadores siguen pendientes del propietario. Sin métricas de conversión ni afirmaciones de mejoras porcentuales en ventas.


### 23/10/2026 — P07 / UX-N03: navegación móvil combinada

**Implementado y validado localmente; no publicado.** Rama `codex/mobile-navigation-filters-20261023`, base `acbcd47`. Categorías horizontales, encabezado móvil compacto, panel de filtros cerrado por defecto de 58dvh con borrador y Aplicar fijo, cierre accesible y WhatsApp sin superposición móvil. Se conservan filtros, sidebar de notebook, tarjetas, precios y lógica comercial.

17 pruebas automatizadas y 17 controles en navegador aprobados; build, TypeScript y lint focalizado sin errores. Evidencia y límites: [entrega local](auditorias/2026-10-23-NAVEGACION-MOVIL-FILTROS.md). No se modificó Production ni se atribuyen mejoras de conversión medidas. La publicación requiere autorización posterior.


### 23/10/2026 — P07 / UX-N03: candidato de publicación autorizado

**En publicación autorizada, pendiente de verificación productiva.** Se consolidan categorías horizontales, panel inferior de 58dvh cerrado por defecto, acceso «Elegí a tu gusto», encabezado «Encontrá lo que buscás», preguntas por categoría y CTA «Ver productos» fijo. WhatsApp sin superposición móvil; notebook conserva navegación y sidebar. Base remota `acbcd47`. Sin cambios comerciales ni de Supabase. Validación focalizada: 20 pruebas aprobadas, build, TypeScript y lint sin errores; una advertencia previa del logo. Se verificará el deployment protegido antes de promover y se restaurará Automatic. No se atribuyen resultados de conversión medidos.


### 23/10/2026 — P07 / UX-N03: publicación detenida por acceso CLI

**Bloqueado para publicación; no publicado.** Candidato `223ca7b0b3f4d1c929761d6dc7c561f16b411456` consolidado y enviado a main por fast-forward con builds bloqueados y verificados. CLI 59.25.4 rechazó la creación con `scope-not-accessible` (sin deployment nuevo). Dominio conserva `dpl_Dt1JKWoYAPDiuqPsuiVjMV3eeqfv` / `acbcd47`. Ignored Build Step restaurado a Automatic y verificado tras recarga; cero builds pendientes. 20 pruebas focalizadas, TypeScript, build y lint sin errores. Falta recuperar el acceso CLI al equipo existente, construir protegido y verificar móvil/notebook antes de promover. No se modificaron Supabase, precios, inventario ni checkout. Este cierre documental permanece local para no disparar otro build.


### 23/10/2026 — P07 / UX-N03: publicado y comprobado

**Publicado.** Código aprobado `223ca7b0b3f4d1c929761d6dc7c561f16b411456`, deployment `dpl_ATk4WoDC8JEkrCQ2kujDn542dhoo` (READY), dominio `sfstore-ten.vercel.app`. Sesión CLI recuperada mediante ingreso oficial, sin modificar permisos. Los 596 archivos fuente subidos coinciden con el candidato; las 20 pruebas, TypeScript y build aprobados se reutilizaron sin repetirlos. Build remoto y TypeScript también aprobaron.

Verificación antes y después de promover: categorías horizontales desplazables; primer producto Perfumes a 435px en 390×844; panel cerrado por defecto, 489,5px (58%), scroll interno y CTA visible; «Elegí a tu gusto» / «Encontrá lo que buscás» / preguntas específicas. Preferencia Fresco aplica `familia=fresco`, con resultados y restauración del scroll. Mates y sidebar de notebook comprobados en 1366×900, sin overflow horizontal. WhatsApp flotante no ocupa controles móviles, ayuda conservada. GET 200 para Mates, Accesorios, búsqueda de cargador, carrito, checkout y login administrativo; sin pedidos ni escrituras. [Capturas productivas](auditorias/assets/2026-10-23-navegacion-publicada/).

Incidencias recuperadas: autenticación CLI ausente y guardado inicialmente bloqueado por sandbox; resueltos usando el ingreso oficial con permiso de escritura en el perfil habitual. Una lectura inicial del dominio tras promoción mostró la versión anterior; recarga y consulta del alias confirmaron la versión nueva. Se conserva la evidencia histórica. Este cierre documental se sincroniza con builds bloqueados; restauración de Automatic y cola se registran en el resultado privado final. Sin medición de conversión ni prueba en dispositivo físico/Instagram WebView.

### 24/10/2026 — P09: pagos, entregas y regalos

**Implementado y validado localmente; no publicado.** Ayuda describe transferencia con 25% de descuento, comprobante dentro del pedido y acreditación manual disponible; diferencia pago confirmado de autorización de retiro (lunes a sábados, 17:30–20:30). Explica envíos nacionales, selección de transporte y cotización cuando falta tarifa. Regalos ofrece Perfumes/Mates sin conversación y aclara que «Consultar regalos» abre WhatsApp. No cambia lógica comercial, checkout, inventario ni Supabase.

17 pruebas focalizadas aprobadas, revisión local móvil/notebook y accesibilidad de acordeones/enlaces. No se promete confirmación bancaria automática ni se atribuyen resultados medidos de conversión. Evidencia, límites y validaciones: [P09 local](auditorias/2026-10-24-P09-PAGOS-ENTREGAS-REGALOS.md). Publicación pendiente de autorización.

### 24/10/2026 — P09 publicado y comprobado

**Publicado.** Código `8f3c7ad6b4ea8f53d56a69ef349d29c02c9a60f9`, deployment `dpl_9DAtHX7BGcNzaUgZPbFp2M9w2Koo`, READY, en `sfstore-ten.vercel.app`. Integración por fast-forward desde `1ff392d`; las 17 pruebas previas se conservaron sin repetir. Build remoto y TypeScript aprobados; 616 archivos fuente cotejados, sin diferencias de contenido salvo saltos de línea.

Comprobados Ayuda, retiro lunes a sábados 17:30–20:30, Regalos y enlaces directos, navegación móvil 390×844 y notebook 1366×900 sin overflow. Carrito y checkout conservaron el mismo total y 25% por transferencia; sin enviar formulario, crear pedido ni acreditar pagos. Se vació la selección local al terminar. Sin cambios de Supabase, inventario o lógica comercial. Detalle y límites: [verificación publicada](auditorias/2026-10-24-P09-PUBLICADO.md). Se conserva la evidencia de la etapa local anterior.

### 24/10/2026 — P02: preparación técnica de fotos para combos

**Implementado y validado localmente; no publicado.** Asociación explícita por conector sobre `product_images`, usando Storage/editor existentes. Cada ficha virtual recibe solo su fotografía; sin foto conserva el placeholder. Asignación administrativa transaccional, confirmación visual y rechazo de IDs/URLs compartidos entre C/C y Lightning. Migración aditiva preparada, sin aplicar; no cambia recetas, precios ni inventario. 20 pruebas de contratos/UI y 8 comprobaciones PostgreSQL aisladas aprobadas; build/TypeScript y revisión visual del estado vacío móvil/notebook. [Resultados y pasos de carga](auditorias/2026-10-24-P02-ASOCIACION-COMBOS-LOCAL.md).

P02 sigue pendiente de fotografías reales aprobadas para las ocho publicaciones. Esta entrega resuelve únicamente la preparación técnica de los dos combos; no supone que se hayan cargado imágenes o publicado la mejora.

## 9. Diagnóstico consolidado y cola única — actualización del 25/10/2026

Esta sección es la única cola vigente. Las secciones anteriores conservan el historial de decisiones y entregas; sus estados antiguos de «no publicado» no sustituyen los cierres siguientes. No se abren tareas nuevas para hallazgos ya corregidos.

**Conciliación documental:** la sección 9 del 22/10 quedó en el worktree de UX y no llegó al archivo de `main`. Se recuperan aquí sus IDs, prioridades y alcance, incorporando las publicaciones posteriores. Los originales se conservan localmente en el worktree `charger-purchase-ux-20261022`: sección 9 original, informe `2026-10-22-ACTUALIZACION-DIAGNOSTICO-UX.md` y auditoría con capturas `2026-10-22-AUDITORIA-CONVERSION-INTEGRAL.md`. No se copian ni se alteran esas evidencias; esta sección contiene el estado operativo necesario sin depender de enlaces a otro worktree. La incorporación documental a `main` está autorizada; queda condicionada a verificar el bloqueo de builds para evitar un despliegue. Los cambios funcionales locales se integrarán por separado sólo cuando estén autorizados.

### Estado productivo y estabilización

El 25/10 se confirmó que `sfstore-ten.vercel.app` publica `ba09b18bb3d5048d28aa16ca587f55e9c6580009`, deployment `dpl_4oK4UpbRSh9fxMDNmpiiBGen7YfA`, READY. `refs/heads/main` remoto apunta al mismo commit. El `main` local permanece en otro commit; no se modificó durante esta lectura.

La verificación directa de PostgreSQL terminó en READ ONLY y ROLLBACK:

- `delete_product_image_metadata_and_queue(uuid,uuid,text,text)` y `edit_component_gallery_image(uuid,text,uuid,text)` existen y sus argumentos coinciden con el código publicado.
- Ambas y `save_component_gallery_atomic` son SECURITY INVOKER; EXECUTE está permitido a `service_role` y denegado a `anon` y `authenticated`. El administrador exige sesión autorizada en servidor antes de invocarlas.
- Las columnas `product_images.combo_connector`, `component_offer_publications.image_gallery` y su proyección pública existen; los triggers de sincronización están habilitados. `public_component_offers` conserva `security_invoker=true` y `security_barrier=true`.
- El índice que limitaba a una imagen por conector está retirado; la guarda de URL distinta se conserva. La antigua RPC de selectores `set_component_offer_images` no tiene EXECUTE para ninguno de esos tres roles.
- Los contratos resultantes de `202610240001`, `202610240002` y la reparación `202610100002` están presentes. Esto comprueba el esquema aplicado; no afirma una reconciliación del registro `supabase_migrations`.
- Los hashes LF de la reparación y del editor coinciden con los archivos ejecutados: `4af7264e7988c047a742ee90690b0559e62d4d70a69db781ce3f369e8710b23f` y `18d00f97400a6e11c33f8e7ebb12e2b6df863f425c84d62e0cc56aefe7dc4469`, respectivamente.

**Conclusión:** no se encontró incompatibilidad de contratos pendiente. La causa confirmada de eliminación —RPC ausente— está resuelta. No se borró ninguna fotografía para ensayar la operación en Production ni se afirma una nueva prueba destructiva de extremo a extremo. No hace falta otra migración ni interfaz para cerrar este incidente. Si aparece un error nuevo, se investiga con su mensaje y contexto, sin reutilizar el diagnóstico antiguo como si siguiera vigente.

### Cierres que no deben volver a desarrollarse

| ID | Estado y alcance cerrado | Límite conservado |
|---|---|---|
| P01 | Publicado: retirada la promesa de cuotas incompatible | No agregar medios de pago inexistentes |
| UX-N01 | Publicado en `acbcd47`: buscador común incluye Accesorios y combos públicos | Conservar sus pruebas; no rehacer búsqueda |
| P07 / UX-N03 | Publicado en `223ca7b`: categorías horizontales, panel «Elegí a tu gusto», «Encontrá lo que buscás» y WhatsApp sin superposición móvil | No equivale al cierre de todos los puntos de P10 |
| P09 | Publicado y verificado: Ayuda, pagos, retiro, entregas y Regalos | Transferencia con acreditación manual disponible; no prometer automatización bancaria |
| P05 / UX-N02 | Publicado: resumen de lista/descuento/transferencia y datos de pago sólo tras crear el pedido; cierre `07ec2e6` | No reimplementar cálculos ni exponer alias antes del pedido |
| P02, técnica | Publicada: ambas presentaciones individuales reutilizan el editor y su galería; RPC y permisos compatibles | La carga y aprobación de fotografías corresponden al propietario; no es cierre del contenido de P02 |
| P08, técnica | Publicada en `984c31c`: categoría, atributos registrados, descripciones legibles e información del SKU elegido | Fuentes para ampliar notas, duración y capacidades siguen pendientes; no rehacer la presentación |

### Cola única priorizada

El orden recupera la sección 9 y descuenta lo ya publicado. «Pendiente conocido» conserva evidencia fechada, no representa una auditoría nueva de todas las pantallas. El impacto comercial es esperado, no medido.

| Orden / ID | Problema y estado | Solución mínima | Impacto esperado | Dependencias | Aprobación necesaria |
|---|---|---|---|---|---|
| 0 · P02, estabilización | RPC faltante corregida; verificación de contratos cerrada | Mantener reparación existente; actuar sólo ante evidencia nueva | Evitar errores al gestionar fotos | Ninguna incompatibilidad detectada | No hay cambio correctivo pendiente; cualquier intervención productiva nueva requiere aprobación |
| 1 · P02 · P1 | Técnica publicada; cobertura fotográfica pendiente de completar por el propietario | Cargar fotos reales de Khamrah, Hawas Elixir, Yara Candy, cabezal, ambos cables y ambos combos desde el editor existente; revisar identidad/conector y portada | Reconocer el artículo y comprar con más confianza | Material aprobado y carga del propietario; verificar cobertura tras esa carga, sin repetir la búsqueda de fotos | Propietario valida y carga; Codex no sube ni borra fotos sin autorización |
| 2 · P03 · P1 | **Publicada y verificada el 25/10/2026**, commit `c83c77f` | Portada Gris aprobada, ningún SKU preseleccionado, selector «Elegí tu color»; elección actualiza imagen/precio/disponibilidad. Miniaturas ocultas sólo en esta ficha; imágenes adicionales conservadas | Facilitar elegir color y reducir dudas en la ficha; impacto de conversión todavía no medido | Otras familias requieren su aprobación de portada; sin fallback automático | Publicación autorizada y completada; cambios posteriores requieren su alcance correspondiente |
| 3 · P04 · P1 | **Publicada y verificada el 26/10/2026**, commit `62bb6b2` | Foto exacta del SKU, nombre comercial y color en carrito/checkout; mismo bloque de identidad y componente de imagen existente. Cantidades y totales conservados | Reducir errores de variante y vueltas a la ficha; impacto aún no medido | Carritos anteriores sin foto guardada muestran «Imagen no disponible», sin inferir imágenes | Publicación autorizada y completada; cambios posteriores requieren su alcance correspondiente |
| 4 · P08 · P1 | **Presentación publicada y verificada el 26/10/2026, commit `984c31c`**; ampliación de contenido pendiente de fuentes | Categoría correcta, atributos registrados y párrafos legibles, información secundaria del SKU elegido y exploración de la misma categoría; sin instrucciones de pago/retiro duplicadas | Ayudar a comparar sin inventar características; impacto aún no medido | Validar fuentes antes de ampliar notas, duración y capacidades ausentes | Publicación técnica completada; cualquier edición de datos reales requiere autorización |
| 5 · P05 / UX-N02 · P1 | **Publicada y verificada el 26/10/2026, commit `07ec2e6`** | Pasos antes del pedido; alias y copia únicamente en la pantalla existente del pedido autorizado, con importe del servidor | Evitar transferencias anticipadas; impacto aún no medido | Conserva sesión del comprador, comprobante y validaciones existentes | Publicación autorizada y completada |
| Posterior · UX-C01 · P2 | **Publicada y verificada el 26/10/2026, commit `07ec2e6`** | Textos consolidados y selector inerte de pago eliminado; condiciones esenciales conservadas | Facilitar lectura y finalización; impacto aún no medido | Sin cambios de contratos ni medios habilitados | Publicación autorizada y completada |
| Posterior · UX-N04 · P2 | **Publicada y verificada el 26/10/2026, commit `07ec2e6`** | Botón global de WhatsApp omitido en carrito y checkout; accesos contextuales conservados; resto de rutas conserva su botón | Evitar controles tapados y clics accidentales | Revisión local celular y notebook aprobada | Publicación autorizada y completada |
| Paralelo · P06 · P1 habilitadora | Medición pendiente; sin atribución de resultados | Definir pocos eventos de búsqueda, ficha, carrito, checkout, consulta y conversión; distinguir pedido y cobro, deduplicar | Saber dónde se pierde intención de compra y priorizar con datos | Consultar instalación vigente sólo al iniciar; privacidad, consentimiento y criterio de conversión | Aprobar herramienta, esquema y activación; no instalar ahora |
| 6 · P10 · P2 | H1 aislado y validado localmente el 26/10, sin publicar; UX-N03 ya cerrado; resto de P10 pendiente | H1 estable y accesible con el título comercial existente, sin modificar el diseño visual ni los banners. Conservar otros controles pendientes hasta verificar el punto concreto | Mejor orientación para tecnologías de asistencia y estructura semántica | No cambiar redondeo; verificar sólo controles aún abiertos | Publicar requiere autorización; no se declara conformidad WCAG completa |
| Posterior · UX-RES01 · P1 técnica | Mensaje de límite de reserva: evidencia aislada, no incidente productivo demostrado | Reproducir únicamente el caso sintético afectado y mejorar el mensaje, sin relajar guardas | Facilitar recuperación cuando se rechaza una reserva | Entorno aislado; escalar prioridad sólo ante evidencia real | Encargo de corrección y publicación posterior; no pedidos productivos de prueba |
| Posterior · P11 | Ajuste de navegación de cargadores encargado y validado localmente, sin publicar; resto pendiente de evidencia | Quitar acceso de Productos y mantener la misma pantalla en Configuración: conserva consulta y registro de composición. Los cinco productos y editores individuales siguen en Productos | Simplificar la operación habitual sin perder configuración especializada | Reutiliza la misma ruta, permisos y formulario; no cambia recetas, inventario o precios | Publicación del ajuste requiere autorización; otras mejoras esperan problema operativo concreto |
| Posterior · P12 · P2 | Refinamientos visuales, contraste y rendimiento: requieren evidencia | Medir el problema puntual antes de optimizar imágenes/componentes; reutilizar tokens. SEO adicional sólo ante fallo demostrado | Menor fricción y carga, sin prometer mejoras no medidas | Evidencia de rendimiento/contraste; P02 aporta material real para evaluar imágenes | Aprobar cambios de identidad; optimizaciones justificadas se encargan aparte |

### P03 — implementación local validada, sin publicar

Diseño y uso de la foto real Gris del Stanley MateSystem aprobados por el propietario el 25/10/2026. Tras la revisión visual, el propietario ajustó el orden móvil a: nombre de familia → fotografía principal → variantes → precio y disponibilidad → compra. La galería existente conserva sus miniaturas junto a la fotografía. En notebook se conserva la galería a la izquierda y la compra a la derecha, con el precio antes del selector. La portada lleva la leyenda de su color representativo y no supone que el visitante eligió Gris.

Los colores aparecen con sus nombres; ninguno empieza seleccionado. Antes de elegir, el CTA indica «Elegí un color para agregar» y está deshabilitado. Tras elegir, la imagen principal corresponde a ese SKU, se muestra «Color: Gris» y el CTA se habilita únicamente si hay disponibilidad. El agotado puede seleccionarse para consultar su imagen, pero no comprarse. Recorrer las fotos del SKU elegido no cambia su selección. Se reutilizan ProductImageGallery, AddToCartButton y el estado de selección existente en ProductFamilyDetail, sin crear otro componente de galería o carrito. La portada sólo se resuelve si su familia, SKU de origen y URL aprobados siguen en el catálogo público recibido; si falta alguno, no se asigna automáticamente otra foto o variante. No se almacenan precios ni stock en esa referencia.

### Avance local del 25/10/2026

- Rama funcional `codex/admin-components-navigation-20261025`, base publicada `ba09b18`: navegación especializada trasladada de Productos a Configuración; etiquetas y H1 ajustados. No hay cambios de datos, contratos comerciales o esquema.
- Se reutilizan las cuatro pruebas de publicaciones individuales aprobadas después del ajuste de navegación. Una comprobación de render con datos sintéticos valida seis condiciones: guard administrativo, enlace a la misma pantalla, ausencia de formularios duplicados, único H1, diseño inicial conservado y categoría presentada sin recomendación. Sin conexiones ni escrituras de esa comprobación.
- P03 está implementada en `codex/p03-family-presentation-20261025`, basada en `main` `e3d6444`. El commit `071633e` permanece en su rama independiente y no se incorpora a P03. No cambia galería compartida, carrito, checkout, servicios de inventario, SQL ni datos de Supabase.
- Validación P03: 7 pruebas nuevas de portada/selección y 4 existentes de familias/carrito/historial aprobadas; ESLint focalizado sin errores; build Webpack y TypeScript aprobados con fixture GET-only en 127.0.0.1 y sin credenciales productivas. El primer build sufrió EPERM del sandbox sobre `.next`; el mismo comando autorizado fuera de esa restricción aprobó. El ejecutor cerró con cero escrituras.
- Primera validación de navegador local, antes del ajuste de orden móvil: 390×844 y 1366×900, sin overflow; CTA móvil visible a y=660 en el fixture; ninguna opción seleccionada al entrar. Se comprobó Gris, cambio de precio de otro SKU sintético, agotado no comprable, galería sin cambio de color, SKU exacto Gris en carrito y teclado Enter. La excepción de precio sólo existe en el fixture. No se creó ningún pedido; el carrito sintético se vació al terminar. Capturas iniciales conservadas como `p03-local-mobile-initial.png`, `p03-local-mobile-grey.png`, `p03-local-mobile-cart.png` y `p03-local-notebook.png`. No se atribuyen resultados de conversión ni validación de dispositivo físico.
- Ajuste visual posterior del 25/10: foto antes del selector en móvil y variantes antes del precio, sin nuevos componentes ni cambios de selección. Verificado en 390×844 sin overflow y en 1366×900 conservando las columnas y el orden de notebook. Comprar sin elegir sigue bloqueado y recorrer las fotos conserva Gris y su precio. Las 7 pruebas afectadas y ESLint aprobaron; se conservan las capturas `p03-mobile-photo-first-initial.png`, `p03-mobile-photo-first-grey.png` y `p03-notebook-order-preserved.png`. Continúa sin publicar y separado de `071633e`.
- Refinamiento móvil encargado después de `acf45ac`: foto más ancha en proporción natural mediante una opción de la galería existente (desactivada por defecto para los demás productos); selector destacado con nombres y marca de elección; precio inicial «Desde» y precio exacto identificado tras seleccionar; aclaraciones compactadas conservando descuento, pago completo y stock no reservado. No se inventan muestras cromáticas: faltan valores de color verificados. Notebook conserva su marco cuadrado, columnas, orden y textos. 9 pruebas focalizadas aprobadas (incluyen galería estándar y alternativa móvil), revisión visual local 390×844/1366×900 sin overflow y proporción 3:4 conservada. Capturas `p03-refinement-mobile-initial.png`, `p03-refinement-mobile-selected.png` y `p03-refinement-notebook-preserved.png`. Pendiente de aprobación visual; no publicar el paquete anterior como si incluyera este refinamiento.
- El contenido pendiente de P08 y la presentación de UX-N02 esperan las decisiones indicadas. P06 espera definición de privacidad/herramienta. No se salta hacia un rediseño o infraestructura nuevos para evitar esas dependencias.

### P03 — ajustes finales aprobados e implementados localmente

El propietario aprobó la propuesta visual refinada y pidió una única indicación inicial: «Elegí un color para continuar». Implementada en el selector existente, con fondo blanco cálido y borde sutil en celular y notebook. Se retiraron las aclaraciones de selección repetidas; la leyenda «Imagen representativa: Gris» identifica la portada sin seleccionar un SKU. Se conserva la disposición móvil nombre → foto → variantes → precio/disponibilidad → compra, y las columnas y orden de notebook. No se modifican archivos ni URLs de fotografías, lógica de selección, precios, inventario, Supabase ni checkout.

Validación final: 9 pruebas afectadas aprobadas, TypeScript y build Webpack con catálogo sintético aprobados; ESLint sin errores (dos advertencias existentes de imágenes). El primer build encontró EPERM del sandbox en `.next`; el mismo comando con acceso local autorizado aprobó. Navegación local 390×844/1366×900 sin overflow, indicación única, ninguna elección inicial y selector blanco cálido comprobados; Gris conserva selección/precio al recorrer su galería y Verde agotado no permite compra. Sin pedidos ni escrituras de prueba. Capturas: `p03-final-implemented-mobile.jpg`, `p03-final-implemented-selected.jpg` y `p03-final-implemented-notebook.jpg` en la carpeta local de visualizaciones. `071633e` continúa separado.

Últimos dos ajustes encargados: título inicial «Elegí tu color» y miniaturas sobre blanco cálido, sin franja oscura. La opción visual se limita a P03 y conserva la galería estándar de otros productos. Diez pruebas afectadas aprobadas; revisión local móvil/notebook sin overflow, fondo claro comprobado y selección/precio conservados al recorrer miniaturas. Fotografías, validaciones y distribución sin otros cambios. Capturas actualizadas: `p03-light-thumbnails-mobile.jpg` y `p03-light-thumbnails-notebook.jpg`.

Decisión posterior del propietario: ocultar completamente las miniaturas de P03 en ambas resoluciones. Implementado en la galería existente con una opción desactivada sólo para esta ficha; se retiró la opción de fondo claro que ya no se usa. No se renderiza la franja ni se reserva su espacio. Las imágenes adicionales siguen en los datos recibidos, sin escrituras ni cambios del administrador. Al entrar se conserva la portada Gris sin seleccionar SKU; elegir color cambia imagen/precio/disponibilidad y mantiene visible la elección. Diez pruebas afectadas aprobadas, incluyendo ausencia de miniaturas, conservación de imágenes y galería estándar intacta. Revisión local 390×844/1366×900: cero miniaturas, cero espacio residual de la franja, sin overflow y agotados no comprables. Capturas vigentes: `p03-no-thumbnails-mobile.jpg` y `p03-no-thumbnails-notebook.jpg`.

### P03 — publicada y verificada el 25/10/2026

- Commit productivo y main remoto: `c83c77f4456605d0bc8504b1e97ae5f2ff4649a5`. Se excluyó `071633e`. Fast-forward exacto autorizado expresamente; sin force ni commits adicionales en main.
- Deployment `dpl_7bg8j1wvs3Cr16chLZ8KVBv9L7gx`, READY, promovido a `sfstore-ten.vercel.app` después de validar su URL protegida con el mismo build de Production. El build automático Git quedó CANCELED por el bloqueo temporal.
- Verificación protegida: celular 390×844 y notebook 1366×900, portada Gris sin selección, fotos por color, precio exacto, agotados bloqueados y ausencia de miniaturas/espacio residual. Carrito local verificó Gris/ST-MSYS-1L-GRI por $35.000 y luego se vació. Catálogo y ficha simple operativos. Sin pedidos ni reservas de prueba.
- Verificación posterior en el dominio público: portada sin selección, fotografía original Gris cargada, selección explícita, precio $35.000, disponibilidad actual y cero miniaturas; capturas móvil/notebook. Catálogo y carrito disponibles; cinco presentaciones de cargadores conservan sus precios aprobados. Sin cambios de Supabase, inventario, precios ni contratos comerciales.
- Ignored Build Step restaurado a **Automatic** y confirmado tras recargar; cero deployments pendientes al cierre. Se reutilizaron las 10 pruebas locales aprobadas; build remoto satisfactorio.
- Incidencias operativas resueltas: acceso CLI renovado; autorización explícita de main obtenida tras rechazo automático del primer push (no ejecutado). La copia de despliegue se exportó como blobs Git exactos después de detectar sólo diferencias CRLF del archivo ZIP.
- Capturas: `p03-production-mobile-initial.jpg`, `p03-production-mobile-selected.jpg`, `p03-production-notebook.jpg` y `p03-release-final-automatic.jpg` en la carpeta local de visualizaciones. Publicado no significa Medido: no hay resultados de conversión atribuidos.

**Estado documental:** este cierre se actualiza localmente. No se hace un push documental adicional a main: la autorización específica del fast-forward limita el remoto al commit funcional exacto `c83c77f`. La siguiente tarea sigue siendo la que corresponda en esta cola, sin iniciarla en este cierre.

**Control de cierre:** Publicado no significa Medido. Se reutilizaron las auditorías existentes; para P03 se ejecutaron sólo pruebas afectadas y navegación local con datos sintéticos. La asociación aprobada de la portada se confirmó mediante GET puntual, sin cambios de Production. Esta actualización no autoriza nuevas funcionalidades ni operaciones productivas.


### P04 — identidad de variante en carrito y checkout, validada localmente

Encargo del propietario del 25/10/2026. Rama `codex/p04-cart-variant-identity-20261025`, base productiva `c83c77f`. El carrito ya conservaba ID, nombre, etiqueta de variante y SKU, pero no fotografía. Se agrega una instantánea opcional de imagen principal y nombre comercial de la publicación seleccionada; nunca se obtiene una foto de la familia, de otro SKU ni de los componentes de un combo. Cada conector conserva su imagen propia si está disponible. Se mantienen la versión 2 del almacenamiento y los carritos anteriores, sin cambiar sus importes ni inventar metadatos faltantes.

Carrito y checkout reutilizan `CartItemIdentity` para presentar fotografía, nombre, color y SKU secundario; el bloque utiliza el `ProductImage` existente del catálogo en tamaño compacto. La presentación estándar del catálogo permanece igual. En checkout el importe se presenta separado para no comprimir el nombre en celular. No cambian payloads, precios, descuentos, cantidades, reservas, inventario ni contratos del servidor.

Validación: 5 pruebas nuevas de identidad/persistencia/legado, conectores y render real de ambas pantallas; 42 regresiones afectadas de variantes, carritos y combos aprobadas. Build Webpack y TypeScript con fixture sintético aprobados; ESLint sin errores, una advertencia existente de `img`. Navegación local 390×844 y 1366×900: dos variantes con imágenes diferentes, selección conservada al recargar y pasar al checkout, totales originales de $70.000 para dos unidades de prueba. Sin overflow. Se vació el carrito sintético; no se enviaron formularios ni crearon pedidos. Fixture GET-only sin credenciales productivas. Capturas: `p04-cart-mobile.jpg`, `p04-cart-notebook.jpg`, `p04-checkout-mobile.jpg`, `p04-checkout-notebook.jpg` en la carpeta local de visualizaciones.

**Limitación explícita:** las líneas antiguas que no guardaron fotografía siguen mostrando nombre, variante, cantidad e importes originales, con «Imagen no disponible». No hay consultas nuevas a Supabase para completarlas ni sustitución por una portada familiar. Las nuevas incorporaciones guardan la imagen exacta recibida del SKU.

**Estado:** implementada localmente, sin push, merge ni publicación. Revisar las capturas antes de autorizar un corte. Esta rama también conserva el cierre documental de P03 que ya estaba actualizado localmente; no incorpora `071633e`.

### P04 — publicación controlada cerrada el 26/10/2026

- Commit autorizado, main remoto y código publicado: `62bb6b212aeeffc008a5730369134ce49642a8b7`. Siete archivos aprobados, sin `071633e`; no se agregaron cambios funcionales al candidato. Rama `codex/p04-cart-variant-identity-20261025`.
- Deployment `dpl_9nKNYidDEFkzB4AxokSuhgJaTC8B`, READY. Se construyó con `--prod --skip-domain`, se verificó la URL protegida y se promovió el mismo build a `sfstore-ten.vercel.app`. El build Git `dpl_3WFg12LfRt8SJ5zYk3eUWXV6ntjv` quedó CANCELED por el bloqueo temporal.
- Se reutilizaron las 47 pruebas aprobadas, build y TypeScript locales; build remoto satisfactorio. Copia de publicación de 637 blobs Git exactos, sin env privados ni archivos temporales.
- Verificación protegida y productiva en 390×844/1366×900: fotografías exactas de Gris y Negro en carrito y checkout; color, nombre, cantidad y totales conservados tras recarga. Dos Gris y un Negro: lista $140.000,01, transferencia $105.000,00. Redondeo existente conservado. Sin overflow observado.
- El carrito público estaba vacío antes de la prueba. Sólo se agregaron líneas locales en el navegador y se vaciaron al terminar. No se enviaron formularios, crearon pedidos/reservas, procesaron pagos ni modificaron Supabase o inventario.
- Ignored Build Step restaurado a **Automatic**, guardado y confirmado después de recargar. Dominio asociado al deployment correcto y cero builds pendientes al cierre.
- P04 se declara publicada sólo después de esas comprobaciones. Pendientes separados, sin implementar: **P05/UX-N02**, alias anticipado; **UX-C01**, repetición de información en checkout; **UX-N04**, WhatsApp superpuesto en notebook. No se duplica el hallazgo del alias en otra cola.
- Evidencias: `p04-production-cart-mobile.jpg`, `p04-production-cart-notebook.jpg`, `p04-production-checkout-mobile.jpg`, `p04-production-checkout-notebook.jpg`, `p04-release-final-automatic.jpg` en la carpeta local de visualizaciones. Impacto comercial todavía no medido.

**Estado documental del cierre:** actualización local, sin push documental adicional. El fast-forward remoto autorizado se limitó al commit exacto `62bb6b2`; este cierre y los pendientes podrán sincronizarse por el procedimiento documental correspondiente. No se inició ninguna otra mejora.

### P05/UX-N02, UX-C01 y UX-N04 — validación local del 26/10/2026

Rama `codex/checkout-clarity-20261026`, base `62bb6b2`. El checkout previo al pedido deja de renderizar `TransferAlias`; reutiliza exclusivamente la pantalla autorizada de pedido existente para mostrar destino y total definitivo. No cambian esa pantalla, el lector autorizado, los handlers de envío/confirmación ni los contratos de pago. Se consolidan textos de carrito y checkout, conservando descuento, pago completo, plazo de 24 horas, comprobante, verificación de acreditación y autorización de retiro. Envío sin cotización mantiene el bloqueo y el aviso de no transferir.

WhatsApp conserva el componente y enlace existentes: dentro del recorrido de compra pasa al flujo normal debajo del contenido, sobre fondo claro; no tapa controles en notebook ni celular. El resto de rutas conserva su comportamiento anterior.

Validación: build Webpack, TypeScript y ESLint focalizado aprobados; fixture de build cerrado con cero escrituras. 13 pruebas focalizadas de destino posterior al pedido, importe del servidor frente a query manipulada, estados no pagables, envío pendiente, totales e identidad de SKU/combos; revisión visual local 390×844 y 1366×900 con fixture sintético GET-only, sin enviar formularios ni crear pedidos. WhatsApp con posición estática debajo del main y sin overflow observado. Capturas `checkout-clarity-cart-mobile.jpg`, `checkout-clarity-cart-notebook.jpg`, `checkout-clarity-checkout-mobile.jpg`, `checkout-clarity-checkout-notebook.jpg` y `checkout-clarity-shipping-notebook.jpg` en la carpeta local de visualizaciones. Sin cambios en Supabase, precios, descuentos, stock, reservas o Production. Estas tres tareas permanecen **sin publicar**; no se mide todavía impacto comercial.

Ajuste final aprobado por el propietario: se elimina completamente el botón global en `/carrito`, `/checkout` y sus pantallas de resultado; se conserva «Consultar carrito por WhatsApp» y los accesos contextuales. Pruebas afectadas y build/TypeScript aprobados. Publicación controlada autorizada, pendiente de verificación del deployment.

### P05/UX-N02, UX-C01 y UX-N04 — publicación cerrada el 26/10/2026

- Commit final autorizado `07ec2e6f295d453063947a798dadc4ddfe294f26`: `f99d47b` más el único ajuste final de eliminar el botón global de WhatsApp en carrito/checkout. Main remoto sincronizado por fast-forward; seis archivos del alcance. No incluye `071633e`.
- Deployment `dpl_CDRPL7TP6qv5cEXXcue7Hn9GiyQR`, READY, construido con 638 blobs Git exactos exportados y `--prod --skip-domain`. Se verificó la URL protegida antes de promover el mismo deployment a `sfstore-ten.vercel.app`.
- 13 pruebas focalizadas, ESLint, build y TypeScript aprobados. En candidato y Production: revisión 390×844/1366×900, foto/Gris/SKU, una unidad, lista $46.666,67, transferencia $35.000,00; sin overflow ni botón global. «Consultar carrito por WhatsApp» conservado; ficha y catálogo mantienen el botón anterior. Checkout no muestra alias/copiar antes del pedido. Envío sin cotizar conserva aviso y botón de pedido deshabilitado.
- No se enviaron formularios, resolvieron CAPTCHA, crearon pedidos/reservas ni procesaron pagos. Sólo carrito local del navegador, inicialmente vacío y vaciado al terminar. No se modificaron Supabase, contratos de pago, precios, reservas o inventario.
- Incidencia del primer intento: Vercel CLI rechazó la sesión; se detuvo antes del deployment y se restauró Automatic. Con acceso renovado se revalidó el destino y se completó la publicación. El build Git `dpl_GTvjnvX8wioefgehhBxXPtMo62BN` quedó CANCELED por el bloqueo previsto.
- `Ignored Build Step = Automatic` guardado y verificado tras recargar; cero builds pendientes al cierre. Evidencias `checkout-production-cart-mobile.jpg`, `checkout-production-cart-notebook.jpg`, `checkout-production-checkout-mobile.jpg`, `checkout-production-checkout-notebook.jpg` y `checkout-release-final-automatic.jpg` en visualizaciones locales. Impacto comercial aún no medido.

Cierre documental actualizado localmente; sin push adicional que provoque otro deployment. Production y main conservan el commit funcional exacto `07ec2e6`.

### P08 — corrección puntual de categoría, 26/10/2026

Rama `codex/p08-product-content-20261026`, base productiva `07ec2e6`. Se recupera exclusivamente la línea de etiqueta del antiguo paquete `071633e`, sin incorporar ese commit ni sus cambios de navegación administrativa/H1. La ficha simple muestra «Categoría: Árabe» (o la etiqueta existente correspondiente) en lugar de convertir una clasificación en «Ideal para». No se modifican atributos, fuentes de datos, descripciones, precios, imágenes, relacionados ni acciones de compra.

Ocho comprobaciones locales de render sobre la página real: cinco categorías de perfume, atributos ausentes, mate y familia. En los cinco primeros casos el HTML difiere únicamente en la etiqueta; en los otros tres es idéntico. Importes y acciones conservados. ESLint focalizado: cero errores, dos advertencias preexistentes de imágenes. Sin conexiones ni escrituras de datos y sin repetir build o auditorías por una única línea de texto. **Implementada localmente; no publicada.**

Para ampliar P08 se propone reutilizar la descripción y los atributos existentes con notas/ocasiones de perfumes y material/capacidad de mates únicamente cuando haya fuentes verificables; no construir otro recomendador. La verificación de contenido y cualquier edición de datos reales requieren el alcance aprobado correspondiente. P02 continúa pendiente del material y carga del propietario; no se solicita nuevamente ni se sustituye con fotos inventadas. El cierre documental de checkout se conserva en un commit local separado, evitando un deployment documental.

### P08 — información comercial existente, avance local del 26/10/2026

Se conserva la rama `codex/p08-product-content-20261026` y los commits separados `c6a37a6` (cierres documentales) y `811028c` (etiqueta de categoría). Sin integrarlos en main ni reescribirlos.

Lectura puntual con la clave pública anónima sobre `public_catalog_skus`, sin credenciales administrativas ni escrituras: 110 SKU públicos, 110 resúmenes y 105 descripciones. Entre 63 SKU de perfumes, 61 tienen perfil olfativo, 59 intensidad y 61 ocasiones registradas. Hay material estructurado en seis de los 16 SKU de categoría mates; los ocho SKU de categoría termos no tienen capacidad estructurada. Son SKU y datos registrados, no publicaciones únicas ni certificación del fabricante. El modelo expone pares nombre/valor sin procedencia verificable para notas o rendimiento. No se extrajeron notas, capacidades ni garantías a partir del nombre o de textos genéricos. No se modificaron esos textos ni datos reales.

Implementación: se extrae el bloque existente «Información del producto» a un único componente compartido, conservando su acordeón y estilos. Reutiliza los normalizadores y etiquetas actuales de atributos, con lista explícita de campos de presentación; no muestra proveedor, costos, metadatos ni valores de taxonomía desconocidos. Presenta perfil olfativo, intensidad orientativa, ocasiones sugeridas, marca, material y contenido/capacidad cuando constan explícitamente. No presenta estilos como notas exactas ni datos como certificados. Las descripciones conservan saltos de párrafo y no se duplican cuando coinciden con el resumen. En familias, el bloque usa únicamente el SKU elegido, sin inferir información del primer SKU ni cambiar la selección; antes de elegir no muestra sus características. No cambia la galería, precios ni acciones de compra.

Se conserva la consulta existente de relacionados y se filtran categoría incompatible y el propio producto; se titula «Seguí explorando / Más en [categoría]». No se implementa otro recomendador ni se declara compatibilidad por pertenecer a una categoría. `ComponentOffers` conserva las relaciones explícitas de recetas. Se corrige el texto ilegible preexistente del estado sin relacionados.

Validación: 7 pruebas nuevas de datos registrados/legado, lista permitida, desconocidos, descripción, escape de HTML, ficha y SKU seleccionado; 10 pruebas existentes de presentación familiar aprobadas. Revisión local GET-only con datos sintéticos en 390×844 y 1366×900, acordeón accesible, párrafos separados, sin overflow, sin datos de proveedor/notas no certificadas y cambio Gris/Negro sin arrastrar información. Sin enviar formularios ni crear pedidos. Capturas `p08-perfume-mobile.jpg`, `p08-perfume-notebook.jpg`, `p08-family-mobile.jpg`, `p08-family-notebook.jpg` en visualizaciones locales. ESLint: cero errores, dos advertencias preexistentes de imágenes. Build Webpack y TypeScript aprobados con fixture sintético, cerrado con cero escrituras.

Pendiente comercial: validar las fuentes de notas, duración, ocasiones y materiales antes de ampliar/corregir contenido real; revisar particularmente las afirmaciones de duración ya existentes en algunas descripciones. Conservar capacidad desconocida sin inferirla del título. Las futuras recomendaciones de complementos requieren relaciones de compatibilidad confirmadas. **Implementado localmente, no publicado.** No cambios en Supabase, inventario, precios, pagos ni Vercel.

### P08 — comprobación puntual del header, 26/10/2026

La captura `p08-perfume-notebook.jpg` mostraba el header a mitad de la imagen. Se reprodujo sin modificar CSS: en notebook 1366×900, con scrollY=528, el header real tiene position:sticky y top=0 en el viewport; la captura fullPage lo ubica a 528 px dentro del documento. Es un artefacto de captura, no una regresión de posicionamiento. Al cargar y volver arriba: scrollY=0, header top=0. En móvil 390×844: position:relative; al cargar top=0 y, tras desplazarse 512,8 px, top=-512,8 y bottom=-328,8, fuera de la ventana. No se superpone como sticky móvil. Sin overflow horizontal observado.

Evidencias originales conservadas. Para revisar P08 usar `p08-perfume-notebook-verified.jpg` y `p08-perfume-mobile-verified.jpg`, tomadas desde scrollY=0; comparación en `p08-header-notebook-scrolled-viewport.jpg` y `p08-header-notebook-scrolled-fullpage.jpg`. Sin cambios de código/header, funcionalidades o Production; no corresponde repetir build ni suites técnicas al no existir un defecto de código.

### P08 — cierre técnico y candidato preparado, 26/10/2026

Último encargo: conservar la foto protagonista y «Información del producto» como contenido secundario; retirar exclusivamente las instrucciones repetidas de pago/retiro. Se elimina del componente compartido el párrafo fijo «Aboná el 100% por transferencia. Para retirar, esperá la confirmación del local.» La instantánea pública revisada no contenía esas instrucciones en descripciones originales; no se aplican filtros ni reescrituras a textos almacenados. Permanecen las condiciones vigentes en precios, Ayuda, carrito y checkout.

17 pruebas afectadas y ESLint aprobados. Se reutilizan build/TypeScript aprobados de la implementación P08: el último ajuste sólo elimina un párrafo estático. Verificación local sintética 390×844: foto de 365,6 px de ancho y 487,46 px de alto, antes de variantes/precio/compra; bloque de información cerrado por defecto y posterior al CTA (y=1296,65). Al abrir conserva material, capacidad explícita y párrafos; perfume conserva su perfil y atributos registrados. Notebook 1366×900 conserva columnas y bloque cerrado, sin overflow; captura desde scrollY=0 y header top=0. Sin pedidos, cargas de fotos ni escrituras. Capturas finales: `p08-final-family-mobile.jpg`, `p08-final-family-information-mobile.jpg`, `p08-final-family-notebook.jpg` en visualizaciones locales.

Candidato sólo local en `codex/p08-product-content-20261026`; commits `c6a37a6` y `811028c` intactos y separados. Sin SQL/migraciones ni cambios en contratos de pagos, precios, selección, disponibilidad, reservas o inventario. Preparación de publicación/reversión y manifiesto de hashes en `staging/runtime/p08-release-private/`; no se ejecuta el corte. La ampliación de notas/capacidades/descripciones que requiera confirmar fuentes permanece pendiente; no bloquea técnicamente la presentación de los datos ya registrados. Publicar requiere autorización expresa.

### P08 — publicación detenida antes de promover, 26/10/2026

Candidato exacto `984c31c4cc15b4dcbf63f40d77633f33ed8d10de`, main remoto actualizado por fast-forward; `811028c` y `c6a37a6` conservados como commits separados. Ocho archivos y hashes aprobados, 641 blobs exportados exactos. Build/TypeScript remoto aprobados; deployment `dpl_BbriLfPuQ9x2jw3vFVfVKotmWU2Y`, READY, sin promoción al dominio. El build Git `dpl_DebGrGmbJvirwtiFF6JiYst9Kwq7` fue CANCELED por el bloqueo previsto.

La revisión visual protegida quedó bloqueada: timeout del controlador, reinicio de su sesión y posterior fallo de despacho CDP al recuperar el acceso. No se repitieron intentos indefinidamente ni se promovió sin comprobar perfume/mate/familia. No es evidencia de una incompatibilidad de aplicación. Production continúa en `07ec2e6`, deployment `dpl_CDRPL7TP6qv5cEXXcue7Hn9GiyQR`. Se restauró Automatic por la API oficial (`commandForIgnoringBuildStep=null`), comprobado con GET independiente de Vercel CLI; antes de restaurar se confirmó `exit 0`. Cero builds pendientes. Sin migraciones, cambios de Supabase, descripciones, precios, stock, fotos, pedidos ni reservas.

**Estado: P08 no publicada.** Requiere recuperar/completar la revisión protegida antes de retomar promoción bajo la autorización correspondiente. No marcar publicada ni rehacer el candidato por este fallo de herramienta. Este registro es sólo local, sin otro push.

### P08 — publicación comprobada y cerrada el 26/10/2026

- Commit publicado y main remoto: `984c31c4cc15b4dcbf63f40d77633f33ed8d10de`. Deployment existente `dpl_BbriLfPuQ9x2jw3vFVfVKotmWU2Y`, READY, promovido sin reconstrucción al dominio `sfstore-ten.vercel.app`. Candidato y Production anterior se revalidaron antes del corte; sin cambios de código ni archivos nuevos en esta reanudación. `c6a37a6` y `811028c` conservan su identidad en el historial aprobado.
- Reutilizadas las 17 pruebas afectadas, ESLint y build/TypeScript aprobados. La pestaña anterior ya no existía; una pestaña nueva recuperó el acceso visual sin cambiar seguridad ni configurar servicios. Revisión protegida completa en 390×844 y 1366×900 antes de promover.
- Verificación en candidato y dominio: Lattafa Khamrah muestra categoría Árabe, perfil/intensidad/ocasiones y párrafos; Camionero Criollo Base de Cuero muestra Criollo/Calabaza; Stanley MateSystem no selecciona color al entrar y mantiene compra bloqueada hasta elegir. Gris conserva foto, nombre, SKU y precios; Verde agotado no permite compra. Información cerrada por defecto y posterior al CTA; en móvil la foto conserva 365,6 px de ancho. Sin overflow observado. Se omite la instrucción fija repetida, sin filtrar ni modificar descripciones almacenadas. Datos ausentes no se completan ni certifican.
- Carrito y checkout verificados en navegación: una unidad Gris, lista $46.666,67 y transferencia $35.000,00; foto/color conservados y alias oculto antes de crear el pedido. No se enviaron formularios, resolvieron CAPTCHA, crearon pedidos/reservas ni procesaron pagos. Carritos de ambos orígenes inicialmente vacíos y vaciados tras la revisión.
- `Ignored Build Step = Automatic` confirmado por GET oficial de proyecto al inicio y cierre (`commandForIgnoringBuildStep=null`); no se modificó la configuración durante esta reanudación, sin pushes ni builds nuevos. Cero builds pendientes. No SQL, Supabase, cargas/borrado de imágenes, precios, compras, ventas o stock modificados.
- Evidencias públicas: `p08-production-perfume-mobile.jpg`, `p08-production-perfume-notebook.jpg`, `p08-production-mate-mobile.jpg`, `p08-production-mate-notebook.jpg`, `p08-production-family-mobile.jpg`, `p08-production-family-notebook.jpg`, `p08-production-cart-notebook.jpg`, `p08-production-checkout-notebook.jpg`, `p08-production-checkout-mobile.jpg` en visualizaciones locales. Impacto de conversión todavía no medido.

**Estado: P08 técnica publicada.** La ampliación comercial de notas, duración, capacidades y recomendaciones de complementos conserva las fuentes/aprobaciones pendientes de la misma cola. Este cierre se actualiza localmente, sin un push documental adicional que dispare otro deployment.

### P10 — H1 estable del inicio, avance local del 26/10/2026

Tras consolidar el cierre documental de P08 en un commit exclusivamente local, se selecciona la siguiente corrección técnica ejecutable de la sección 9. P02 y el contenido adicional de P08 dependen de material/fuentes del propietario; P06 requiere decidir herramienta, privacidad y activación. No se repiten auditorías ni se crean sistemas paralelos.

Rama `codex/p10-home-heading-20261026`, base productiva `984c31c`. Se recupera sólo el H1 estable del inicio preparado en `071633e`: «Perfumes, mates y regalos importados», con la clase existente `sr-only`. El commit original no se incorpora ni se arrastran sus cambios administrativos. El texto ya está en metadata; no agrega promesas comerciales ni cambia banners, navegación, precios o datos.

Validación focalizada: prueba existente del inicio/Regalos ampliada para comprobar un único H1 estable y sus destinos, aprobada (una prueba ejecutada mediante filtro; no se repite la suite de Ayuda). ESLint sin errores y una advertencia preexistente de imagen. En fixture sintético GET-only, 390×844 y 1366×900: encabezado nivel 1 presente en el árbol de accesibilidad, sin aria-hidden/display:none, tamaño visual 1×1 y posición absoluta; no ocupa espacio de layout y no hay overflow del documento. Banners, enlaces y presentación existentes conservados. Capturas `p10-home-heading-mobile.jpg`, `p10-home-heading-notebook.jpg` en visualizaciones locales. No se repite build general por este ajuste semántico de una línea; no se declara conformidad WCAG completa ni mejoras SEO/conversión medidas.

**Estado: implementado localmente, sin publicar.** Sin push, integración de main, Vercel, Supabase ni cambios productivos. Los cierres documentales se guardan localmente para evitar un deployment documental. Publicar P10 requiere autorización posterior. P06 permanece pendiente de aprobar herramienta y tratamiento de datos, sin instalar instrumentación.
