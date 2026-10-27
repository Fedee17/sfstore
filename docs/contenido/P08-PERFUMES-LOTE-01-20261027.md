# P08 — Lote inicial de contenido de perfumes para revisión

Fecha: 27/10/2026. Estado: **propuesta local; no cargada ni publicada**. Lectura GET de `public_catalog_skus` del proyecto confirmado, con paginación por ID y filtro de stock positivo; no se consultaron datos privados ni se ejecutaron escrituras. La disponibilidad es una instantánea, no una garantía futura.

## Resultado de la revisión

28 SKU públicos de Perfumes con stock: 18 frascos y 10 decants. 16 resúmenes coinciden con plantillas genéricas; los restantes no están certificados por ser más detallados. 20 registros no tienen Marca; ninguno de los 28 tiene Contenido/Volumen/Capacidad estructurado. Dos frascos tienen precio sin definir (La voie y Momento); quedan fuera de este lote de seis SKU con stock y precio válido. No se modifican precios ni su protección.

No se propone reemplazar masivamente atributos existentes. Un campo completo puede tener procedencia desconocida. Se preservan los valores originales y cada diferencia queda pendiente de revisión.

## Cómo reutilizar el editor actual

- Marca: atributo existente, sólo después de confirmar identidad del envase. Nombre: propuesta explícita, nunca renombrado automático.
- Contenido/capacidad y concentración: confirmar envase de cada SKU; no completar desde la presentación encontrada en una tienda externa.
- `olfactory_family`, `intensity` y `occasion`: usar exclusivamente las opciones existentes. Perfil, intensidad y ocasiones siguientes son recomendaciones editoriales, no datos medidos ni una promesa de rendimiento. Si no se aprueba la intensidad, conservarla pendiente, sin inventar un valor.
- Descripción breve: texto propuesto. Descripción larga: el mismo criterio comercial más las notas declaradas y la aclaración orientativa, disponible en CSV. Las notas se incorporan al texto existente; no se crea otro editor ni un atributo administrado nuevo.
- Las notas son descriptores declarados por la marca, no una lista de ingredientes ni una certificación de componentes naturales. No agregar horas de duración, equivalencias con otros perfumes, promesas de cumplidos ni restricciones de uso por género.

## Seis propuestas

### 1. Lattafa Khamrah

- **SKU:** `9a56021e-9a8c-4bc6-a937-996d46faec61`. Nombre actual: Lattafa Khamrah.
- **Marca propuesta:** Lattafa. **Presentación de referencia externa:** 100 ml; concentración no confirmada en la ficha consultada. **Presentación del SKU:** pendiente de verificar.
- **Notas declaradas:** Canela, nuez moscada y bergamota; dátiles, praliné y flores blancas; vainilla, tonka, benjuí, mirra y maderas ambaradas.
- **Perfil propuesto:** dulce, especiado, ambarado, gourmand. **Intensidad orientativa propuesta:** intensa. **Ocasiones sugeridas:** salida, noche, evento. No son mediciones de duración ni proyección.
- **Descripción breve propuesta:** Un perfil cálido de canela, dátiles y praliné, con un fondo de vainilla y resinas ambaradas. Si te gustan los perfumes dulces y especiados, es una opción para explorar en salidas y ocasiones especiales.
- **Fuente:** [referencia consultada](https://lattafa.com/product/khamrah/). Acceso/evidencia: Ficha oficial completa.
- **Pendiente:** Confirmar Khamrah original y volumen del frasco. La pirámide oficial menciona muguete y el texto menciona Mahonial: no trasladar esa diferencia como una nota única certificada.

### 2. Lattafa Yara Candy

- **SKU:** `a6158818-9fa9-4762-a98f-06d6f7a8afb3`. Nombre actual: Lattafa Yara Candy.
- **Marca propuesta:** Lattafa. **Presentación de referencia externa:** 100 ml; concentración no confirmada en la ficha consultada. **Presentación del SKU:** pendiente de verificar.
- **Notas declaradas:** Mandarina verde y grosella negra; acorde de caramelo efervescente de frutilla y gardenia; sándalo, jarabe de vainilla, almizcle y ámbar.
- **Perfil propuesto:** dulce, frutal, floral, gourmand. **Intensidad orientativa propuesta:** media. **Ocasiones sugeridas:** diario, salida, cita. No son mediciones de duración ni proyección.
- **Descripción breve propuesta:** Frutilla de estilo golosina, frutas y gardenia sobre un fondo de vainilla y sándalo. Una propuesta dulce y frutal para quienes prefieren aromas juguetones; la sugerimos para uso cotidiano o salidas informales.
- **Fuente:** [referencia consultada](https://lattafa.com/product/yara-candy/). Acceso/evidencia: Ficha oficial completa.
- **Pendiente:** Confirmar que el frasco corresponde a Yara Candy y su volumen; no confundir con Yara Rosa, Tous ni versiones de desodorante.

### 3. Lattafa Opulent Dubai

- **SKU:** `65027262-d36d-4230-a859-40a007489bfa`. Nombre actual: Lattafa Opulent Dubai.
- **Marca propuesta:** Lattafa. **Presentación de referencia externa:** 100 ml; concentración no confirmada en la ficha consultada. **Presentación del SKU:** pendiente de verificar.
- **Notas declaradas:** Limón, jengibre, pomelo y mango; jazmín, violeta y cedro; acorde de ámbar gris, maderas, musgo de roble y benjuí.
- **Perfil propuesto:** frutal, citrico, amaderado. **Intensidad orientativa propuesta:** media. **Ocasiones sugeridas:** diario, salida. No son mediciones de duración ni proyección.
- **Descripción breve propuesta:** Mango y cítricos con un toque de jengibre, un corazón floral y un fondo de maderas y resinas. Si buscás un perfil frutal con contraste cítrico, puede acompañar el día o una salida informal.
- **Fuente:** [referencia consultada](https://lattafa.com/product/opulent-dubai/). Acceso/evidencia: Ficha oficial completa.
- **Pendiente:** Confirmar volumen del frasco. Se usa mango según Lattafa; no agregar otras frutas por analogía con perfumes similares.

### 4. Rasasi Hawas Elixir

- **SKU:** `b5cb8397-6821-4f8d-bc77-cb335e757ef4`. Nombre actual: Hawas Elixir.
- **Marca propuesta:** Rasasi. **Presentación de referencia externa:** 100 ml; concentración no confirmada en la ficha oficial regional. **Presentación del SKU:** pendiente de verificar.
- **Notas declaradas:** Artemisa, bergamota y hierbabuena; chocolate amargo, lavanda y benjuí; almizcle blanco, tonka y vainilla.
- **Perfil propuesto:** dulce, aromatico, gourmand. **Intensidad orientativa propuesta:** intensa. **Ocasiones sugeridas:** salida, noche, cita. No son mediciones de duración ni proyección.
- **Descripción breve propuesta:** Una apertura herbal y mentolada da paso a chocolate amargo, lavanda y un fondo de vainilla y tonka. Para quienes disfrutan los perfumes dulces con contraste aromático, lo proponemos para salidas o encuentros nocturnos.
- **Fuente:** [referencia consultada](https://store.rasasi.com.sa/en/qqbmgxk/p1607630288). Acceso/evidencia: Ficha completa del e-store oficial regional de Rasasi.
- **Pendiente:** Confirmar frasco Hawas Elixir y volumen. No copiar las notas de Hawas For Him, Fire o Black ni las de otros Elixir.

### 5. Al Haramain Amber Oud Dubai Night

- **SKU:** `66c152aa-98db-4827-b4c7-fdc2721da2a6`. Nombre actual: Al Haramain dubai night.
- **Marca propuesta:** Al Haramain. **Presentación de referencia externa:** 100 ml Extrait de Parfum en la referencia AHP1485; también existe 75 ml. **Presentación del SKU:** pendiente de verificar.
- **Notas declaradas:** Bergamota, azafrán y elemí; oud, rosa búlgara y muguete; almizcle blanco, tonka, ámbar y musgo de roble.
- **Perfil propuesto:** amaderado, ambarado, especiado, floral. **Intensidad orientativa propuesta:** intensa. **Ocasiones sugeridas:** noche, evento, salida. No son mediciones de duración ni proyección.
- **Descripción breve propuesta:** Especias y bergamota abren un perfil de rosa y oud, con fondo ambarado y almizclado. Si te atraen las maderas con presencia floral, es una opción para explorar en salidas nocturnas y ocasiones especiales.
- **Fuente:** [referencia consultada](https://shop.alharamainperfumes.com/uae/haramain-amber-oud-gold-dubai-night-100ml-extrait-de-parfum.html). Acceso/evidencia: Contenido indexado de la tienda oficial; apertura directa agotó tiempo.
- **Pendiente:** El nombre local está abreviado. Confirmar Amber Oud Dubai Night, concentración y tamaño mediante envase; no elegir automáticamente entre 75 y 100 ml.

### 6. French Avenue Liquid Brun

- **SKU:** `6ca63ce3-5694-418f-90a8-5d8043f4c2f5`. Nombre actual: French Avenue Liquid Broun.
- **Marca propuesta:** French Avenue. **Presentación de referencia externa:** Eau de Parfum en catálogo indexado; volumen local pendiente. **Presentación del SKU:** pendiente de verificar.
- **Notas declaradas:** Canela, bergamota, cardamomo y azahar; vainilla bourbon y elemí; almizcle, praliné, ambroxan y madera de guayaco.
- **Perfil propuesto:** dulce, especiado, gourmand, amaderado. **Intensidad orientativa propuesta:** intensa. **Ocasiones sugeridas:** salida, noche, cita. No son mediciones de duración ni proyección.
- **Descripción breve propuesta:** Vainilla y praliné con canela, cardamomo y un fondo amaderado. Para quienes buscan un perfume dulce y cálido con matices especiados, lo proponemos para citas o salidas nocturnas.
- **Fuente:** [referencia consultada](https://fragranceworld.ae/wp-content/uploads/2024/12/Catalogue-Fragrance-World.pdf). Acceso/evidencia: Catálogo oficial indexado; PDF directo 404. Corroboración indexada de Basenotes, apertura 403.
- **Pendiente:** BORRADOR CONDICIONAL: el registro dice Liquid Broun. Confirmar Liquid Brun original EDP frente a Limited Edition/Extrait y recuperar ficha primaria accesible antes de aplicar.

## Cobertura del resto del catálogo disponible

Todos los siguientes requieren verificar el contenido/capacidad estructurado. La presencia de «5 ml», «60 ml» o «100 ml» en un título sólo es un indicio, no una verificación del envase. La tabla conserva nombres e identidades actuales; no propone fusiones ni reasignaciones.

| Producto actual | ID | Hallazgo / siguiente verificación |
|---|---|---|
| Al Haramain dubai night | `66c152aa-98db-4827-b4c7-fdc2721da2a6` | Lote 01; notas y texto propuestos, pendiente aprobación e identidad/presentación |
| Club de Nuit Intense Man | `631dc501-2496-4c4f-9900-b0b14fbd19d2` | Resumen genérico; pendiente investigar edición y fuente primaria |
| CONFIDENTIAL GOLD - 100ML | `2e51cf34-5c02-42ff-867e-7a06d8bf273b` | Resumen genérico; pendiente investigar edición y fuente primaria |
| Decant Game of Spades Full House 5ml | `8d828391-4a86-4eb9-bb6a-f384bc3e1d7d` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant hawas elixir | `2db67b25-6e37-446a-8e98-5f626d5efc63` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant hawas fire | `f91c4caa-32bb-4450-8a87-25422095257b` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant hawas Kobra 5ml | `8f06198a-0199-407d-9d5d-9e7c38bcd578` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant hawas malibu 5ml | `0be4f17b-4888-466f-ad13-3643a645f730` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant hawas tropical 5ml | `fe29c305-f0f8-4752-855c-c785be1046ac` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant hawas verde | `b6db64db-4768-43f9-aadd-e72f24d6d318` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant Lattafa Kahambra | `e5b37a2f-ab84-4009-b8d3-1a6f307c3eda` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant liquid brun | `8ca47237-b9ae-4720-a8be-043ecd104ed7` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| Decant Rayhaan elixir | `3e52b75d-007c-4637-8ad7-3dd3a8efb159` | Verificar perfume de origen y volumen; revisar afirmaciones de rendimiento/equivalencia no acreditadas |
| French Avenue Liquid Broun | `6ca63ce3-5694-418f-90a8-5d8043f4c2f5` | Lote 01; notas y texto propuestos, pendiente aprobación e identidad/presentación |
| Hawas Elixir | `b5cb8397-6821-4f8d-bc77-cb335e757ef4` | Lote 01; notas y texto propuestos, pendiente aprobación e identidad/presentación |
| HOMME BLACK - 100ML | `c6ab646e-ea3c-4ca9-928a-3f518e49f5e6` | Resumen genérico; pendiente investigar edición y fuente primaria |
| La voie Maison Alhambra | `882a3d14-32f2-42c1-8944-4f7710aaa7e2` | Resumen genérico; pendiente investigar edición y fuente primaria; precio indefinido, conservar Consultar precio |
| Lattafa Eclaire | `ad228c7e-6279-424f-a436-36e85685e5b8` | Resumen genérico; pendiente investigar edición y fuente primaria |
| Lattafa Khamrah | `9a56021e-9a8c-4bc6-a937-996d46faec61` | Lote 01; notas y texto propuestos, pendiente aprobación e identidad/presentación; conservar información válida ya presente |
| Lattafa Opulent Dubai | `65027262-d36d-4230-a859-40a007489bfa` | Lote 01; notas y texto propuestos, pendiente aprobación e identidad/presentación |
| Lattafa Yara Candy | `a6158818-9fa9-4762-a98f-06d6f7a8afb3` | Lote 01; notas y texto propuestos, pendiente aprobación e identidad/presentación |
| Lattafa Yara Rosa | `f1cb2323-0e7f-49d6-a26f-110595c90e55` | Resumen genérico; pendiente investigar edición y fuente primaria |
| Lattafa Yara Tous | `e53066cc-9c35-47e2-8d27-0fe5fb425ce8` | Resumen genérico; pendiente investigar edición y fuente primaria; Marca registrada SFSTORE no concuerda con el título Lattafa, confirmar antes de corregir |
| Momento Riffs | `157b6bb8-464c-472a-bf7d-34582bd20ccf` | Resumen genérico; pendiente investigar edición y fuente primaria; precio indefinido, conservar Consultar precio |
| Qaed Al Fursan Untamed | `bedb3ca2-68ed-4158-a00f-4b203b4d8f92` | Resumen genérico; pendiente investigar edición y fuente primaria |
| Rasasi Hawas For Him | `880dfa55-41c2-4275-91e7-ca7def54ec14` | Resumen específico, pero «gran duración» no verificada; confirmar edición y presentación |
| SALVO ELIXIR - 60ML | `f57365ec-33f2-4807-aa64-18a77c00b00b` | Resumen genérico; pendiente investigar edición y fuente primaria |
| Stallion 53 Uomo Intense | `314ab75f-58b3-49c5-8602-cda72295d855` | Resumen genérico; pendiente investigar edición y fuente primaria |

## Límites de las fuentes y aprobación necesaria

- Las fichas oficiales de Lattafa y el e-store regional de Rasasi se leyeron directamente. La tienda oficial Al Haramain se consultó mediante su contenido indexado tras fallar la apertura directa.
- Liquid Brun: el catálogo del fabricante devuelve 404 al abrirse; la pirámide indexada distingue su columna de Azzure Aoud. [Basenotes](https://basenotes.com/fragrances/liquid-brun-by-french-avenue.26275554) ofrece corroboración indexada; su apertura fue rechazada (403). [Parfumo](https://www.parfumo.com/Perfumes/french-avenue/liquid-brun) fue accesible inicialmente, pero no se pudo recuperar de forma estable su pirámide. No se presentan reseñas comunitarias como hechos oficiales. Mantener este registro condicionado a fuente primaria accesible e identidad confirmada.
- Aprobar textos y etiquetas orientativas; confirmar fotos de envases/etiquetas, volumen y edición de los seis SKU. No se necesitan precios nuevos ni cambios de inventario.
- No se cargó contenido, no se cambiaron atributos ni descripciones originales. CSV semicolon UTF-8 preparado para revisión, no para importación automática. El Plan de Mejora Continua sigue siendo la única cola de trabajo.

## Conciliación posterior a la aprobación del propietario — 27/10/2026

**Este apartado actualiza el estado anterior sin borrar su evidencia.** El propietario confirmó autenticidad y 100 ml de los seis perfumes, aprobó descripciones y atributos orientativos, y confirmó Broun → Brun. Las dudas de volumen/autenticidad anteriores quedan resueltas por esa confirmación. No equivale a confirmar concentración ni edición específica; tampoco autoriza escrituras productivas.

Se repitió únicamente la lectura GET de los seis IDs en `public_catalog_skus`, solicitando nombre, descripciones y atributos. No se invocaron RPC ni se consultaron/modificaron precios, costos o stock en esta comparación. Los seis registros siguen presentes.

### Actualización mínima propuesta

| Producto | Cambios frente al estado leído | Información preservada / conflicto |
|---|---|---|
| Lattafa Khamrah | Informar 100 ml en descripción; aplicar resumen aprobado y descripción específica | No quitar perfiles ni ocasiones existentes; conservar género, Tipo, identidad y datos comerciales. El texto nuevo conserva el carácter dulce/ambarado y el uso nocturno, agregando detalle; no afirmar Mahonial como equivalente de muguete. |
| Lattafa Yara Candy | Informar 100 ml en descripción; aplicar resumen aprobado y descripción específica; completar Marca: Lattafa | No quitar perfiles ni ocasiones existentes; conservar género, Tipo, identidad y datos comerciales. |
| Lattafa Opulent Dubai | Informar 100 ml en descripción; aplicar resumen aprobado y descripción específica | No quitar perfiles ni ocasiones existentes; conservar género, Tipo, identidad y datos comerciales. |
| Hawas Elixir | Informar 100 ml en descripción; aplicar resumen aprobado y descripción específica; completar Marca: Rasasi; sumar perfil: gourmand | No quitar perfiles ni ocasiones existentes; conservar género, Tipo, identidad y datos comerciales. |
| Al Haramain dubai night | Informar 100 ml en descripción; aplicar resumen aprobado y descripción específica; completar Marca: Al Haramain; sumar perfil: ambarado, floral; intensidad media → intensa | No quitar perfiles ni ocasiones existentes; conservar género, Tipo, identidad y datos comerciales. |
| French Avenue Liquid Broun | Informar 100 ml en descripción; aplicar resumen aprobado y descripción específica; completar Marca: French Avenue; corregir Broun → Brun | No quitar perfiles ni ocasiones existentes; conservar género, Tipo, identidad y datos comerciales. Notas exactas y concentración pendientes; no volcar todavía su pirámide al texto público. |

### Preservación y compatibilidad con el editor

- Las familias y ocasiones finales son la unión de lo ya registrado y lo aprobado. La propuesta original era un subconjunto descriptivo, no un motivo para borrar etiquetas válidas. Khamrah conserva frutal y cita; Opulent Dubai conserva fresco/ambarado y cita/evento; Liquid Brun conserva ambarado y evento; Dubai Night conserva dulce y cita; Hawas Elixir conserva fresco/ambarado y suma gourmand. Yara Candy ya coincide.
- Marca: conservar Lattafa en Khamrah y Opulent Dubai; completar los cuatro campos vacíos con Lattafa, Rasasi, Al Haramain y French Avenue, respectivamente. Conservar los nombres salvo la errata expresamente confirmada de Liquid Brun; no ampliar automáticamente el nombre de Hawas o Dubai Night.
- Los 100 ml se agregan en la descripción larga. `getProductCommercialInformation` sabe leer Contenido/Volumen/Capacidad, pero `buildProductAttributes` y el contrato `save_product_atomic` sólo admiten Marca, Tipo y atributos de taxonomía existentes. No mandar un atributo nuevo de capacidad: el servidor lo rechazaría. No se propone migración ni interfaz.
- La descripción larga propuesta aporta presentación y notas, sin repetir íntegramente el resumen. Se reemplazan las plantillas genéricas justificadamente; en Khamrah se conserva el significado válido (dulce, ambarado, uso nocturno/especial) y se amplía con las notas respaldadas.
- Mantener `commercial_category`, `gender`, `Tipo`, atributos heredados no gestionados e imágenes. No armonizar género con etiquetas comerciales de fabricantes en esta tarea: no es necesario para completar el lote. El editor reenvía atributos gestionados: conservar sus selecciones completas al guardar.
- No declarar Eau de Parfum o Extrait sólo por autenticidad y volumen. Liquid Brun puede usar el resumen orientativo aprobado y 100 ml; la pirámide detallada sigue pendiente de fuente primaria accesible y edición confirmada. La discrepancia floral de Khamrah permanece fuera de la propuesta de notas principales.
- Antes de una eventual ejecución autorizada, reabrir cada editor con su versión vigente, conservar slug/SKU y los valores comerciales tal como están, y detenerse ante diferencias concurrentes. El guardado usa control de versión; no sortearlo. Ningún guardado se ejecutó en esta tarea.

### Verificación local

Seis IDs únicos contrastados con la lectura actual. Valores finales de perfil, intensidad y ocasión comprobados contra las opciones de `lib/catalog/attribute-config.ts` y las listas del contrato SQL canónico existente; todos admitidos. Ningún valor de perfil u ocasión actual se elimina. No hay campos de precio/costo/stock en la propuesta de cambio. CSV UTF-8 con separador punto y coma, valores antes/después y textos completos: [comparación revisable](P08-PERFUMES-LOTE-01-CAMBIOS-PROPUESTOS-20261027.csv). El CSV anterior conserva el primer borrador; para esta revisión usar la comparación posterior.

## Validación segura previa a autorización — 27/10/2026

El propietario aprobó la comparación antes/después. Se conserva el CSV aprobado sin cambios, SHA-256 `2c65d66445f7abd656356fa38cc44cdf0eda57165c3d5cff47a70de5603b5c81`. Lectura actual completada a las 2026-10-27T14:44:16.490315+00:00; sólo GET de la vista pública, sin invocar RPC, ejecutar guardados o escrituras dentro de ROLLBACK remoto.

**Resultado: seis de seis coinciden con los valores anteriores aprobados; cero diferencias detectadas en nombres, textos y atributos comparados.** La comparación de atributos se normalizó por nombre, valor y orden, evitando atribuir cambios al orden del resultado. La simulación en memoria produjo exactamente los valores finales del CSV, preservando las etiquetas actuales fuera de los cambios autorizados.

| Producto | Columnas a actualizar | Agregados de atributos | Modificaciones de atributos |
|---|---|---|---|
| Khamrah | Resumen y descripción | Ninguno | Ninguna |
| Yara Candy | Resumen y descripción | Marca Lattafa | Ninguna |
| Opulent Dubai | Resumen y descripción | Ninguno | Ninguna |
| Hawas Elixir | Resumen y descripción | Marca Rasasi; perfil gourmand | Ninguna |
| Dubai Night | Resumen y descripción | Marca Al Haramain; perfiles ambarado y floral | Intensidad media → intensa |
| Liquid Brun | Nombre, resumen y descripción | Marca French Avenue | Ninguna |

Total: seis productos, trece asignaciones de columnas (doce textos y un nombre), siete altas de atributos y una modificación; cero eliminaciones. Los seis textos largos incluyen 100 ml exactamente como figura en el CSV. Liquid Brun no recibe notas detalladas ni concentración.

### Mecanismo de actualización previsto y conservación

Se reutilizan `products` y `product_attributes`, con sus permisos y validaciones existentes, sin nuevas tablas, RPC, campos ni interfaces. Se preparó localmente un manifiesto de cambios mínimos en `staging/runtime/p08-content-private/lot01-minimal-patch-review.json`: sólo `name` cuando corresponde, `short_description` y `description`; inserciones puntuales de atributos faltantes y cambio puntual de la intensidad aprobada. El manifiesto **no es un ejecutor ni fue enviado a Supabase**.

El guardado habitual del editor (`saveProductForm` → servicio de guardado atómico) prepara un producto completo y reconstruye los atributos gestionados. No se invocó para evitar reenviar precios, costos u otra configuración sin necesidad. Para una eventual carga autorizada, la opción mínima es una transacción administrativa acotada sobre esas tablas existentes, con bloqueo y comparación de precondiciones antes de actualizar sólo los campos del manifiesto; no reemplazar registros ni listas completas de atributos. Su SQL exacto, permisos vigentes y efectos de triggers deben verificarse en la preparación final antes de ejecutarlo; no se afirma que exista hoy una RPC de actualización parcial ni se inventa una.

Se preservaron en la simulación ID, slug, SKU, precio público, stock, fotografías y todos los demás campos públicos leídos. No se leyó el costo privado: queda fuera de todos los campos propuestos. Por ello esta prueba demuestra alcance y preservación del parche, no una certificación de contratos privados o triggers productivos. No se ensayó todavía una escritura de PostgreSQL ni se probó el editor con guardados reales.

Validaciones adicionales: valores finales admitidos por las opciones existentes y por las listas del SQL canónico revisado; comparación exacta con CSV; detección de cambios concurrentes simulados en descripción y ocasiones; ausencia de eliminaciones y ausencia de notas detalladas de Liquid Brun. Una reejecución futura deberá reconocer el estado final ya aplicado o detenerse ante un estado intermedio, nunca repetir altas a ciegas. No se declara probada todavía la idempotencia de un ejecutor SQL inexistente.

**Estado: validación de lectura y simulación local aprobada; pendiente autorización de cambios productivos y preparación/verificación final de la transacción mínima.** No cambios de código funcional, Supabase, precios, costos, stock, imágenes, permisos o Production.

## Validación técnica final — 27/10/2026

**Listo para solicitar autorización de ejecución, sin actualización productiva realizada.** Consulta PostgreSQL 17.6 por el Session pooler del proyecto confirmado, TLS `verify-full`, transacción `REPEATABLE READ READ ONLY` y ROLLBACK. Contraseña sólo en memoria, eliminada al terminar. Se inspeccionaron columnas/defaults, restricciones e índices, grants/RLS, triggers habilitados y cuerpos de sus funciones para products/atributos/imágenes y dependencias relevantes. No hubo diferencias frente a la lectura anterior en nombres, textos, atributos, slug, SKU, precio público, stock ni fotografías.

### Permisos y efectos reales

- El rol administrativo PostgreSQL existente tiene SELECT/UPDATE de products e INSERT/UPDATE de product_attributes. No hace falta conceder permisos ni modificar políticas RLS. La escritura se prevé mediante ese acceso administrativo aprobado, no mediante anon/authenticated ni una RPC nueva. Los valores del CSV se validan explícitamente: una escritura directa no debe presumir que el guardado general del editor aplicará sus validaciones.
- Los seis productos no son históricos, no pertenecen a familias y tienen commercial_label nulo. La guarda de identidades históricas admite el cambio. Las restricciones de IDs, SKU y slug no se alteran.
- Al cambiar los textos se ejecuta `set_updated_at`; la intensidad modificada también actualiza su marca técnica. Esto es previsto. El cambio de nombre de Liquid Brun activa `set_product_commercial_label`; al ser producto simple, conserva NULL. Precio/costo/stock/SKU/slug/commercial_label y todos los demás campos comerciales se comprueban idénticos dentro de la transacción.
- Los triggers de precio, variantes por precio, stock de componentes y sincronización de imágenes no se disparan por los campos del parche. No se actualizan familias ni se invoca la propagación de precios. Ningún UPDATE nombra columnas de precio/stock/familia para evitar disparar triggers `UPDATE OF` aunque el valor fuese idéntico.

### Transacción revisable y concurrencia

Archivo privado local: `staging/runtime/p08-content-private/lot01-atomic-update-review-private.sql`. SHA-256: `f1a23d15b07c70aca587f15a90f27c170e940e19335768bb3cb20abb298ab3c6`. CSV de entrada aprobado intacto: `2c65d66445f7abd656356fa38cc44cdf0eda57165c3d5cff47a70de5603b5c81`. No es una migración ni crea objetos persistentes.

Una única transacción SERIALIZABLE abarca los seis productos. Adquiere bloqueos de filas en orden estable con NOWAIT, también para atributos e imágenes. Las referencias FK de los hijos impiden insertar nuevas filas sobre un padre bloqueado. Compara la versión/textos, todos los campos protegidos (incluido costo privado), atributos completos e imágenes antes de la primera escritura. No ejecuta actualizaciones si detecta un estado cambiado o parcialmente aplicado. Sólo reconoce un lote ya aplicado completo como reintento sin escrituras; cualquier estado incierto exige lectura antes de repetir.

Los controles posteriores se ejecutan antes de COMMIT; cualquier error aborta también los cambios anteriores del lote. Nunca se borra/reemplaza el conjunto de atributos. Las fotografías sólo se leen/bloquean, sin actualizar sus registros ni Storage. Los registros de atributos existentes conservan sus IDs; las siete altas usan el UUID por defecto del esquema.

Antes de una ejecución autorizada se debe repetir **esta lectura de metadatos y permisos**, comparar con el paquete revisado y detenerse ante deriva; verificar ambos hashes y enviar sólo esta transacción. Su preflight interno vuelve a comprobar todos los datos bajo bloqueo inmediatamente antes de escribir. No se debe afirmar que la lectura actual garantiza el estado de una ventana futura. Timeouts, conflictos SERIALIZABLE o desconexión no habilitan reintentos automáticos: resolver primero el estado real en lectura.

### Ensayo PostgreSQL aislado

12 comprobaciones aprobadas en `postgres:17.6`, red Docker `none`, cero puertos publicados y filas sintéticas. Se reprodujeron las columnas, defaults, checks, índices y triggers relevantes a partir de los metadatos leídos. No se copiaron precios, costos, existencias, imágenes reales ni datos personales al fixture. Los FK externos que sólo involucran identidad/procedencia inalteradas se inspeccionaron, pero no se recrearon sus tablas externas en esta prueba focalizada.

- Aplicación completa y coincidencia con los textos/atributos del CSV.
- Conservación exacta de los campos protegidos e imágenes sintéticos.
- Error tardío: rollback de todos los productos y atributos.
- Cambios previos concurrentes en descripción/atributos: detención sin sobrescritura.
- SKU bloqueado por otra sesión: rechazo NOWAIT sin cambios parciales.
- Dos ejecuciones simultáneas: una aplicación efectiva, sin duplicación; reintento posterior sin escrituras.
- Trigger sintético que altera costo: postcheck rechaza y revierte el lote.

Se corrigieron durante el armado del ensayo el orden de creación de FK del fixture y una ambigüedad de variable SQL; el archivo final arriba identificado es el que aprobó. El contenedor descartable fue retirado. No se repitieron suites comerciales generales.

**Pendiente relevante:** autorización expresa para aplicar el archivo exacto, seguida de revalidación inmediata de metadatos/permisos/estado. No se detecta un bloqueo técnico actual. Liquid Brun conserva pendientes sus notas detalladas y concentración; no se cargan. Sin migraciones, permisos nuevos, cambios de editor, push, despliegues ni escrituras productivas.

## Cierre de ejecución autorizada — 27/10/2026

**Lote 01 aplicado y verificado en Production** del proyecto `xspvoicelbxlmtqoiolc`. COMMIT confirmado el 27/10/2026 a las 12:00:57 (Argentina, UTC−03). SQL exacto autorizado, SHA-256 `f1a23d15b07c70aca587f15a90f27c170e940e19335768bb3cb20abb298ab3c6`. Una sola ejecución; sin reintentos. El preflight PostgreSQL de lectura inmediatamente anterior coincidió íntegramente con la referencia aprobada, incluidos permisos, esquema, triggers, restricciones y los seis productos/atributos/imágenes.

Se aplicaron únicamente los textos aprobados de los seis perfumes, con 100 ml; la corrección de nombre Liquid Broun → Liquid Brun; siete atributos nuevos y una intensidad modificada. No se eliminaron atributos ni se reemplazaron productos completos. Notas detalladas de Liquid Brun y concentraciones no suficientemente confirmadas siguen pendientes y no se cargaron.

Lectura posterior al COMMIT: los seis nombres, resúmenes, descripciones y valores de Marca/perfil/intensidad/ocasiones coinciden con el CSV. Campos protegidos completos idénticos antes/después, incluidos precios de lista/transferencia, costo, stock, SKU, slugs, IDs, configuración comercial y fotografías. Los atributos anteriores conservan sus IDs y valores salvo la intensidad expresamente autorizada; sólo cambian sus timestamps técnicos previstos. Permisos, políticas, esquema y triggers no cambiaron.

Verificación pública por GET de la vista y HTML de las seis fichas: HTTP 200, nombre, resumen, descripción completa y 100 ml presentes; atributos públicos coinciden con lo aprobado. No se accionaron botones de compra ni se crearon pedidos/reservas. No se modificó el código ni se ejecutaron migraciones, despliegues o cambios de configuración.

| Producto actualizado | Ficha pública verificada |
|---|---|
| Lattafa Khamrah | [Abrir ficha](https://sfstore-ten.vercel.app/producto/lattafa-khamrah) |
| Lattafa Yara Candy | [Abrir ficha](https://sfstore-ten.vercel.app/producto/lattafa-yara-candy) |
| Lattafa Opulent Dubai | [Abrir ficha](https://sfstore-ten.vercel.app/producto/lattafa-opulent-dubai) |
| Hawas Elixir | [Abrir ficha](https://sfstore-ten.vercel.app/producto/hawas-elixir) |
| Al Haramain dubai night | [Abrir ficha](https://sfstore-ten.vercel.app/producto/al-haramain-dubai-night) |
| French Avenue Liquid Brun | [Abrir ficha](https://sfstore-ten.vercel.app/producto/french-avenue-liquid-broun) |

**Incidencias: ninguna.** La URL de Liquid Brun conserva `french-avenue-liquid-broun` porque el slug se protegió expresamente; el nombre visible ya es French Avenue Liquid Brun. No es un cambio pendiente incluido en esta intervención.

Evidencia privada local, sin contraseñas: `production-immediate-preflight-private.json`, `production-postcheck-private.json`, `production-execution-status-private.json`, `production-execution-output-private.txt` y `production-public-postcheck-private.json` en `staging/runtime/p08-content-private/`. Las instantáneas con costos permanecen fuera de Git. No incorporar esos artefactos a informes públicos ni commits.

Estado del seguimiento: **P08 Lote 01 cerrado/aplicado**. P08 general continúa con los otros contenidos pendientes; no se declara completo todo el catálogo. Actualización documental sólo local, sin push ni deployment adicional.
