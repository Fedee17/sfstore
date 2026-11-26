# Catálogo y búsqueda boutique · candidato local del 20/11/2026

**Origen:** copia de `next-16-4-6-20261116` (candidato de Codex sin metadatos Git), tomada el 20/11. Línea base intacta en `catalog-boutique-20261120-base`. Sin commits, push, merge, despliegues ni datos productivos. Pendiente de integrar a la sección 9 del Plan y a PROJECT_CONTEXT cuando el propietario apruebe.

## 1. Suite en verde (independiente del catálogo)

Los cinco fallos registrados el 19/11 eran de fixtures, no de producto:

- `tests/admin-price-calculation.test.mjs`: el mock del módulo de acordes faltaba (`perfumeAccordAttribute is not a function`). Se agrega un mock que no aporta atributo, igual que un guardado sin acordes.
- `tests/fixtures/component-gallery-render.mjs`: el cargador no resolvía el import relativo sin extensión `./perfume-accord-editor` (ENOENT). Resuelve `.tsx`/`.ts` como el build.

Resultado: 1.108 pruebas, 1.084 pases, 0 fallos, 24 omisiones opcionales (antes 1.075/5 fallos/24).

## 2. Etapa 3 — catálogo y búsqueda

Aplica el orden de [STOREFRONT-DESIGN-ARCHITECTURE](STOREFRONT-DESIGN-ARCHITECTURE.md#orden-de-implementación): tras encabezado y Home, el tema se extiende a Perfumes, Mates, Accesorios y Buscar.

- `components/catalog/catalog-frame.tsx`: marco común (encabezado compartido + `data-storefront-theme="boutique"` + lienzo `storefront-surface`, sin follaje), enlace «Volver a categorías» y estado vacío. Textos, parámetros, filtros, orden y URLs sin cambios.
- `components/catalog/catalog.module.css`: sólo tokens de `storefront-theme.css`. Mapeo semántico 1:1 de los azules: acento claro → `--boutique-soft`; texto/enlace → `--boutique-olive`; acción/foco → `--boutique-action`/`--boutique-focus`; títulos → `--boutique-heading`; secundario → `--boutique-muted`; bordes → `--boutique-border`; selección → `--boutique-badge`. Acción principal y secundaria con los acabados de compra y consulta de la ficha.
- Barra lateral y diálogo móvil de filtros consumen ese módulo; lógica, foco y teclado intactos.
- Tarjeta compartida: el catálogo recibe los acabados que la Home ya aplicaba (foco, marca oliva, compra con degradé, consulta). Precio, ahorro, SKU, stock y confirmación verde sin cambios. Las tarjetas «Más en …» de la ficha no cambian.

## 3. Validación

- TypeScript 0 errores; ESLint focalizado 0 errores (5 avisos previos).
- Pruebas afectadas de catálogo/Home/metadatos 52/52.
- Vista previa sintética GET-only (`tests/fixtures/family-presentation-preview.mjs --journey`) en Edge a 320/390/768/1024/1366: 45 vistas antes/después, sin overflow ni errores JS; elementos azules del catálogo de 109–192 a 12 (los comunes del pie y flotantes, también presentes en Home/ficha). Home y ficha idénticas byte a byte en los cinco anchos.
- Interacciones: diálogo móvil (selección, Escape devuelve foco, «Ver productos» aplica `categoria=arabe&familia=dulce`), filtros de escritorio y «Limpiar filtros», foco oliva en tarjeta, botón de 44 px y confirmación verde al agregar.

## 4. Revisión independiente (subagentes de diseño y técnico) y correcciones

- Corregido: lienzo que no llegaba al pie en páginas cortas (`.page` flex + `.canvas` flex), Accesorios con restos azules (insignia de categoría, consulta, botón compacto y foco de tarjeta ahora leen tokens con el valor anterior como respaldo fuera del tema), jerarquía h1→h2 en el vacío de Perfumes Árabes, reglas duplicadas, borde del casillero de filtros a `--boutique-muted` (≥3:1, WCAG 1.4.11) y prueba nueva `tests/catalog-frame.test.mjs` que renderiza el marco real.
- Resultado final: suite 1.110 pruebas, 1.086 pases, 0 fallos, 24 omisiones; tsc 0; ESLint focalizado 0 errores. 45 vistas sin overflow ni errores JS. Ficha idéntica byte a byte; Home sin piezas afectadas (la diferencia de captura a 320/390 es la carga diferida de las fotos de «¿Qué estás buscando?»).
- No verificado: tarjetas agotadas y Accesorios con productos (el catálogo sintético no los tiene), modo oscuro, lector de pantalla, `next build` (compartía `.next` con la vista previa).
- Previo, sin cambios: objetivos táctiles de escritorio de 36–40 px en filtros.

## 5. Decisiones del propietario

1. **Decidido por el propietario (20/11):** «Ver producto» / «Elegir opción» del catálogo llevan el degradé de compra, como en la Home. Las tarjetas «Más en …» de la ficha no cambian; sólo se modificarían con un pedido expreso.
2. **Decidido por el propietario (20/11):** el título del catálogo lleva la línea oliva de Éclaire (48×4 px, `--boutique-title-line`, 10 px de separación y 12 px desde 1024 px), aplicada en `.title` de `catalog.module.css`. Verificado en Perfumes, Mates, Buscar y Accesorios de 320 a 1366 px, sin desborde ni errores. La ficha quedó idéntica byte a byte.
3. **Decidido por el propietario (20/11):** el catálogo lleva el follaje de esquina compartido (`storefront-surface.botanicalCorner`) igual que la ficha aprobada, detrás del contenido y sin interceptar clics. Pruebas del marco y de las páginas 25/25 y tsc 0. En 25 vistas de 320 a 1366 px, sin desborde ni errores. Ficha idéntica byte a byte.
4. **Decidido por el propietario (20/11), opción B tras ver la comparativa:** la etiqueta «Agotado» usa `--boutique-soft` y `--boutique-muted` (contraste 5,68:1) en la tarjeta compartida (`product-card.module.css`) y en la ficha simple (`product-detail-layout.tsx`); fuera del tema conserva el rosa anterior como respaldo. Las fichas de familia indican el agotado dentro de la opción de variante y no cambian. Verificado: suite 1.110 / 1.086 pases / 0 fallos, tsc 0 y colores calculados iguales en tarjeta y ficha. Limitación: los datos de prueba no tienen una ficha simple agotada; la etiqueta se comprobó insertando su marcado en la ficha real.

**Catálogo aprobado visualmente por el propietario el 20/11.**

## 6. Home: pedidos del propietario (20/11), pendientes de revisión

- **Fondo de toda la página:** el lienzo boutique pasa al `<main>` de la Home (`storefront-surface.pageBackground`, sin cambiar el color de texto de otras secciones). La sección de descubrimiento conserva hojas, color y posición sin repetir el fondo, así que no hay costura. «¿Qué estás buscando?» no cambia de contenido.
- **Banner móvil (<640 px), autorizado expresamente:** foto cuadrada centrada en los frascos (`object-position: center 62%`) y texto en un panel con el degradé oliva de las tarjetas de «¿Qué estás buscando?». El CTA usa el acabado de consulta de la ficha y el título reserva dos líneas para que ambos banners midan lo mismo. Banner completo dentro de la primera pantalla a 360×740 (abajo en 693 px), 390×844 (723) y 430×932 (763); sin desborde ni errores. Escritorio y tablet idénticos píxel a píxel (768/1024/1366). Pruebas de Home 28/28.
- **Resto de las secciones («hay partes que todavía no siguen los estilos»):** nuevo `app/home-sections.module.css`, sólo con tokens boutique. Las tarjetas de beneficios usan el panel del catálogo con ícono oliva. «Elegí un regalo» usa botones de contorno de consulta y «Consultar regalos» con el degradé de compra. «¿No sabés qué elegir?» va en el panel oliva de las tarjetas, con el botón marfil. El texto general queda en `--boutique-ink`. En el banner pasan a tokens el marco, el CTA (acabado marfil de consulta en todos los anchos; en escritorio deja de ser azul) y los puntos del carrusel (oliva el activo).
- **Validación:** suite completa 1.110 pruebas, 1.086 aprobadas, 0 fallas y 24 omitidas. tsc 0; ESLint 0 errores (la advertencia `no-img-element` de `app/page.tsx` ya existía). Capturas de 320 a 1366: status 200, sin desborde ni errores JS. Ningún color heredado visible en la Home; los únicos restos son del panel del carrito cerrado (etapa 4). Antes/después en `docs/evidence-home-20261120/`.
- Sin cambios: fotos, textos y enlaces de los banners.

## 7. Rotación del banner, Ayuda y carrito (pedidos del propietario, 20/11)

- **Rotación automática del banner:** no existía. Se había quitado sin justificación en 9bf823b, un commit de checkout. Vuelve con un hook compartido nuevo, `components/use-carousel-rotation.ts`, que ahora también usa el carrusel de destacados: la lógica de temporizador ya no está duplicada.
  - Cambia cada 5 s y pausa con el mouse encima.
  - Se detiene para siempre al enfocar o elegir un banner (WCAG 2.2.2).
  - No rota con movimiento reducido ni con la pestaña oculta.
  - Mientras rota, `aria-live` queda en «off».
  - Medido en 390 y 1366: avanza a los 5,6 s y vuelve al primero a los 10,6 s.
  - Aprobado por el propietario el 21/11, con el intervalo de 5 s.
- **Ayuda y Carrito (Ayuda aprobada 20/11):** usan el marco aprobado del catálogo (`CatalogFrame`: lienzo, hojas, título con línea oliva, paneles, botones de compra y de consulta).
- **Contenido del carrito** (página y panel lateral): tokens boutique, con el valor anterior como reserva fuera del tema.
- **Resumen del carrito más claro (pedido del propietario, 20/11, «demasiado texto»):** las cuentas quedan siempre a la vista en tres líneas («Subtotal de lista», «25% de descuento» y «Total», textos elegidos por el propietario) en lugar de «25% OFF por transferencia» más un desplegable «Ver detalle de precios». Debajo va una sola acción principal, «Continuar», y una nota corta: «En el siguiente paso elegís envío o retiro sin cargo». Sin aviso de redondeo (decisión del propietario). La diferencia entre el total redondeado y el importe exacto que se cobra se resolvió con el «Descuento por redondeo» del checkout (ver abajo). Sin el aviso «No transfieras hasta confirmar el pedido.» (decisión del propietario: en el carrito el cliente todavía no tiene los datos para transferir); el checkout lo conserva hasta su etapa. Mismos importes y la misma lógica: sólo cambian textos y orden. Se borró el CSS del desplegable (código muerto).
- **Mejoras de funcionamiento del carrito (pedido del propietario, 20/11, puntos 1 a 4; aprobadas 21/11 junto con los textos del resumen):**
  - Al agregar un producto se abre el panel del carrito (evento `sfstore:cart-added`, que escucha `CartDrawer`).
  - Quitar un producto o vaciar el carrito muestra «Deshacer» durante 6 segundos (`restoreItems`).
  - Cuando se llega al stock, debajo del producto aparece «Máximo disponible: N unidades.».
  - Al abrir el carrito, sea la página o el panel, se consultan el precio y el stock públicos actuales en el nuevo `GET /api/catalog/cart`. Es de sólo lectura, admite hasta 50 SKU, tiene caché de 60 s y devuelve 503 si el catálogo no responde. Con la respuesta se actualiza el carrito y se avisa: cambio de precio, cantidad ajustada al stock o producto agotado que se quita. Los combos y los SKU que no figuran no se tocan, y el checkout los vuelve a validar en el servidor. Si hay cualquier falla, el carrito queda igual.
  - **Descuento por redondeo (idea del propietario):** el checkout nombra «Descuento por redondeo» la diferencia entre el total redondeado que ve el cliente y el importe exacto que se cobra (`getWebRoundingDiscount`). No cambia lo que se cobra. Se quitó la aclaración «los precios de referencia se redondean hacia arriba».
  - Pruebas nuevas en `tests/cart-improvements.test.mjs`.
- **Paso de entrega antes del checkout (pedido del propietario, 20/11, opción A; aprobado 20/11 con el desplegable de envío):** «Continuar» lleva a la nueva `/checkout/entrega`, «¿Cómo querés recibir tu compra?», con dos tarjetas que son enlaces: «Retiro en el local · Sin cargo» (dirección, horario y «Esperá la confirmación del local antes de retirar») y «Envío a domicilio».
  - **Envío (pedido del propietario, 20/11):** tocar «Envío a domicilio» despliega ahí mismo provincia, localidad, dirección, código postal y transporte preferido. Se validan con las mismas reglas que el checkout: una sola `validateShippingAddress`, y el checkout ya no tiene su copia ni su propia lista de transportes. Si falta algo, se marcan los campos y el foco va al primero.
  - La dirección se guarda sólo en `sessionStorage` de esa pestaña (`sfstore-checkout-shipping`), nunca en la URL, y se borra al crear el pedido. Un borrador incompleto o alterado se ignora. Se lee con `useShippingDraft` (`useSyncExternalStore`, como el resto del proyecto).
  - El método viaja en la URL (`?entrega=retiro|envio`, `lib/checkout/delivery-choice.ts`). El checkout lo preselecciona y muestra un resumen con «Cambiar» en lugar de los dos botones. Con envío, el resumen incluye la dirección y el transporte, y el checkout pide sólo el cálculo del envío. «Cambiar» vuelve al paso con el formulario abierto y los datos cargados.
  - Un valor desconocido o ausente (enlaces viejos) deja los dos botones como antes, con retiro preseleccionado. No cambian la validación, la cotización de envío ni el importe.
  - Con el carrito vacío, el paso muestra «Tu carrito está vacío» y no ofrece opciones.
  - Pruebas en `tests/delivery-step.test.mjs`; el recorrido sintético del navegador pasa por el paso nuevo.
  - `scripts/audit/public-browser.mjs` (auditoría manual contra el sitio público) sigue buscando textos viejos del carrito («Ver detalle de precios», «Continuar con transferencia»); hay que actualizarla antes de volver a usarla contra esta versión.
- **Checkout y comprobante en estilo boutique (pedido del propietario, 21/11):**
  - `/checkout` y `/checkout/exito` usan `CatalogFrame` y una sola hoja compartida, `app/checkout/checkout.module.css`, que reemplaza a `entrega/delivery.module.css`.
  - Se quitaron los colores heredados de la página, del comprobante, de `checkout-payment-report-form` y de `transfer-alias`; una prueba de `tests/delivery-step.test.mjs` lo controla.
  - Los campos del checkout comparten un solo marcado (`textField`) y suman `autoComplete`.
  - Los textos, montos, avisos «No transfieras», la validación y el envío del pedido quedaron iguales.
  - `/checkout/fallo` y `/checkout/pendiente` solo redirigen al carrito: no tienen pantalla.
  - Capturas en 390 y 1366 de retiro, envío, sin elección y comprobante sin pedido: sin desborde ni errores. El comprobante con un pedido real no se pudo ver en la vista previa, que no crea pedidos.
  - Revisión 21/11 (diseño y técnica independientes), corregido:
    - el paso de entrega solo mueve el foco al primer error después de enviar, no mientras se corrige;
    - con retiro elegido vuelve el aviso «Esperá la confirmación del local antes de retirar», con prueba;
    - hay prueba del checkout con la dirección tomada del paso;
    - los avisos dentro de paneles conservan su color;
    - el resumen ya no queda fijo, porque era más alto que la pantalla;
    - las opciones heredadas tienen `aria-pressed` y la elegida se distingue del mouse encima;
    - los tres estados vacíos usan panel y botones;
    - el formulario de pago tiene botón de archivo, mensajes y foco boutique;
    - «Consultar comprobante privado» mide 44 px;
    - los importes del comprobante van en el color de precio.
  - Comprobante verificado en sus cuatro estados (esperando, informado, pagado y cerrado) con el componente real y pedidos sintéticos insertados en la vista previa, sin servidor ni POST.
  - Decisiones del propietario 21/11:
    - Errores con tono propio: nuevo token `--boutique-danger` (#9a3324) en `storefront-theme.css`. Lo usan `.error`, los campos con `aria-invalid` y `.alert`.
    - El botón flotante del carrito tampoco aparece en `/checkout*` (`site-header.tsx`), igual que en `/carrito`.
    - `cart-item-identity` (miniatura, nombre, variante y SKU en el carrito y el resumen) pasa a tokens boutique.
  - Textos (revisión del propietario 21/11; puntos 1 a 9 corregidos, 11 a 14 aprobados, 10 no aprobado):
    - «Ingresá la localidad.», en lugar de «la ciudad».
    - «Sin cargo» en todos lados; se quitó «Retiro sin cargo.», que estaba repetido.
    - «Envío a domicilio» en las opciones heredadas.
    - En el resumen, «Productos con 25% de descuento» reemplaza a «Productos por transferencia (25% OFF)».
    - «Finalizar compra», en lugar de «Checkout».
    - «unidad» o «unidades», según la cantidad.
    - «Número de pedido».
    - El plazo de pago se muestra sin segundos y con «hs».
    - «3 MB» en el formulario de pago.
    - «Total con retiro en el local» y «Total con envío».
    - «Desde que se creó el pedido» en el comprobante y «Desde que se crea el pedido» en el checkout.
    - «El costo del envío depende del destino. Lo calculamos con las tarifas del local.»
    - El comprobante muestra el aviso de retiro solo en pedidos con retiro: `getBuyerCheckoutReceipt` ahora también lee `orders.shipping_method`.
  - Sin cambiar: «Pendiente de cotización; no transfieras» (punto 10) y «3 MiB» en la pregunta de Ayuda, que ya estaba aprobada.
  - Sin cambiar, ya estaba así: «Tu carrito está vacío» se ve un instante antes de cargar el carrito, y los mensajes de error se leen dos veces con lector de pantalla.
- **Botón flotante del carrito:** pasa al degradé oliva de compra.
  - El botón y el `<dialog>` están fuera de `[data-storefront-chrome]`, así que declaran `data-storefront-theme="boutique"` por su cuenta.
- **Validación:**
  - Suite 1.111 pruebas: 1.087 aprobadas, 0 fallas, 24 omitidas. tsc 0 y ESLint 0 errores.
  - /ayuda, /carrito y la ficha en 320 a 1366: sin desborde ni errores.
  - Panel abierto en 390 sin colores heredados.
- **Tarjetas de «Los más elegidos» (decisión del propietario, opción A, «cada elemento en una fila»):** se eliminó la regla horizontal de escritorio (foto 2:3 al 34%). La tarjeta usa en todos los anchos la tarjeta vertical base, con foto cuadrada arriba, igual que el catálogo; no hay CSS nuevo.
  - 1366: tarjeta de 257×480–489 y foto de 255×255. El chip entra en una línea y la sección entra en una pantalla de 700 px de alto.
  - 1024: el chip todavía se parte en dos líneas.
  - Sin desborde ni errores; suite 1.087/0.
- **Foto normal sin recorte (decisión del propietario, 20/11):** cuando el producto no tiene recorte verificado en `home-isolated-photos.json`, las tarjetas de la Home muestran la foto principal del producto en lugar de «Imagen no disponible».
  - El recorte, si existe, sigue teniendo prioridad.
  - Cambio en `components/product-grid.tsx`: el `?? null` forzado para `homeLayout` se reemplaza por `isolatedPhoto` sin modificar.
  - La prueba de `home-discovery` se actualizó a la nueva regla.
  - tsc 0; suite 1.111 pruebas: 1.087 aprobadas, 0 fallas, 24 omitidas.
  - Home de 320 a 1366: status 200, sin desborde ni errores.
- **«Elegí un regalo a tu manera» (pedido del propietario):** la propuesta con imágenes generadas por IA se rechazó y no se integró.
  - **Estructura:** cuatro tarjetas iguales en una lista, con los mismos destinos de antes. «Consultar regalos» sigue abriendo WhatsApp en otra pestaña y conserva su texto oculto para lectores de pantalla.
  - **Fotos:** cada tarjeta lleva una tira horizontal chica (5:2, con `contain: size`) de tres recortes reales de SFSTORE ya publicados en `public/home/recortes`. Son perfumes, mates, bombillas y termos; no hay imágenes nuevas.
  - **Texto:** el nombre va centrado debajo, con lugar para dos líneas.
  - **Distribución:** dos columnas en móvil y una fila de cuatro desde 768 px.
  - **Estilos:** solo tokens boutique y el acabado de panel. La opción de contacto usa el degradé de compra.
  - **Código muerto:** `.primary` de `home-sections.module.css` quedó sin uso y se eliminó.
  - **Medidas:** tarjetas de 148×120 en 390, 150×121 en 768 y 246×159 en 1366, todas iguales.
  - **Validación:** sin desborde ni errores. Suite 1.087/0, tsc 0 y ESLint 0 errores; la advertencia `no-img-element` es del mismo patrón que `CategoryCard`.
- **Regalos con fotos ambientales generadas por IA (nuevo encargo, sin aprobar):** se siguió el flujo de §5.1: investigación, generación, revisión independiente.
  - **Productos reales usados** (verificados en Production por lectura, con stock):
    - **Perfumes:** Dubai Night, Khamrah, Asad.
    - **Mates:** Algarrobo Simple, Torpedo animal print.
    - **Complementos:** porta mate cuero, dispenser de yerba, Bombilla Pico de Loro.
    - **Consultar:** Khamrah, Torpedo, Termo GOAT Negro, Bombilla Pico de Loro.
  - **Resultado de la revisión independiente:** las 4 imágenes fueron rechazadas.
    - **Perfumes:** colores cambiados y textos mal escritos («Lattafe», «VENDIOGEITEUR»).
    - **Mates:** la silueta del algarrobo sale tulipa, también en la v2.
    - **Complementos:** el dispenser sale nogal en lugar de pino ahumado, también en la v2.
    - **Consultar:** lateral de la caja y escala incorrectos; la v2 no se pudo generar.
  - **Créditos:** IMG.LY quedó sin créditos (1.296 usados).
  - **Código:** la sección sigue con la versión anterior (tira de recortes reales). La implementación nueva (foto 16:10 arriba, nombre y flecha) quedó guardada fuera del repo, en `scratchpad/regalos-pendiente/`, para aplicarla cuando haya fotos aprobadas.
- **Ritual Matero (pedidos del propietario):**
  - Tres tarjetas verticales por vista desde 640 px, igual que «Los más elegidos». En móvil, una tarjeta horizontal con la foto de borde a borde.
  - Tarjetas (pedido del propietario, aprobado 20/11): sólo título, con más protagonismo (800, hasta 1,625 rem), sin descripción; tarjeta horizontal rectangular en todos los anchos, con la foto de borde a borde a la izquierda y el contenido centrado. Una por vez en teléfonos, con las flechas debajo para que la tarjeta use todo el ancho; dos por vez desde 768 px. Reemplaza las tres tarjetas verticales.
  - Pestañas (decisión del propietario, 20/11: «son demasiados»): sólo Mates, Termos y Yerbas. Bombillas, vasos térmicos y accesorios materos quedan en el catálogo, sin pestaña en la Home.
  - Nueva prueba de agrupación.
- **Precio «Desde» en el panel compacto (aprobado 20/11):** «Desde» ya no queda tachado en el precio de lista y va en línea antes del precio. La ficha no cambia.
- **Hojas de la Home (pedido del propietario, aprobado 20/11):** se quitó la foto de hojas detrás de «¿Qué estás buscando?»; queda el fondo de la página. La rama de hojas del encabezado (`--sf-foliage`, ya aprobada) asoma detrás del contenido en los márgenes libres. A pedido («más hojas») son nueve ramas, alternando ambos lados: beneficios, «¿Qué estás buscando?», «Los más elegidos» (dos), «Ritual Matero», «Elegí un regalo» (dos) y «¿No sabés qué elegir?». Las secundarias son más chicas y giradas para que no parezcan copias. Sólo desde 1280 px: en teléfonos y tablets no hay margen libre. Catálogo y ficha siguen con su esquina botánica.
- **Validación:** suite 1.112 pruebas: 1.088 aprobadas, 0 fallas, 24 omitidas. tsc 0.
- **Pendiente:** checkout, con 87 colores heredados en `app/checkout/page.tsx`, además de las páginas de éxito, fallo y pendiente.

Fuera de alcance: carrito y checkout (etapas 4 y 5), fotografías nuevas, banners y «¿Qué estás buscando?».
