# Revisión completa del sitio público (21/11)

Siete revisores independientes revisaron el sitio sin modificar nada y solo con pedidos GET a la vista previa local. Cada uno cubrió un aspecto: diseño, textos, accesibilidad, celular, técnica y seguridad, rendimiento, y experiencia de compra. Se unieron los hallazgos repetidos y los principales se comprobaron contra el código.

Resultado general: no hay nada crítico, ninguna página se desborda a lo ancho en los anchos probados y no aparecieron errores de JavaScript. Los controles de seguridad del comprobante y del pago están bien.

## A. Defectos que se pueden corregir sin decisión comercial (por impacto)

| # | Gravedad | Qué pasa | Dónde | Lo vieron |
|---|---|---|---|---|
| A1 | Alta | Pantalla del pedido sin pedido (otro navegador, pestaña cerrada): solo ofrece «Volver al carrito», que queda vacío, y no hay vía de contacto. El pedido puede vencer sin pagarse. | `app/checkout/exito/page.tsx:14` | Experiencia de compra |
| A2 | Alta | Página 404 con la paleta y la letra viejas (azul, Arial). | `app/not-found.tsx` | Diseño |
| A3 | Alta | Celular horizontal: el panel del carrito no deja ver los productos ni «Consultar por WhatsApp». | `components/cart.module.css:64-66` | Celular |
| A4 | Media-alta | Corregir nombre, teléfono o email borra sin aviso la tarifa de envío elegida y deshabilita el botón. | `app/checkout/page.tsx:99` | Técnica y experiencia de compra |
| A5 | Media | El ahorro se muestra con centavos y no coincide con la resta de los precios que se ven: lista $ 10.001, precio $ 7.501, «Ahorrás $ 2.500,25». | `components/product-price-panel.tsx:23` | Textos y experiencia de compra |
| A6 | Media | Las páginas de carrito, entrega, checkout, pedido y 404 se titulan todas «SFSTORE Importados». La Home no lleva la marca en el título. | `app/carrito/page.tsx`, `app/checkout/*`, `app/not-found.tsx`, `app/page.tsx:22` | Textos y accesibilidad |
| A7 | Media | El buscador del encabezado tiene letra de menos de 16 px, así que el iPhone hace zoom al tocarlo. | `components/site-header.module.css:116,183` | Celular |
| A8 | Media | El botón flotante de WhatsApp tiene texto blanco sobre verde claro: contraste 1,98:1, muy por debajo del mínimo. | `components/whatsapp-floating-button.tsx:24` | Accesibilidad |
| A9 | Media | Los carruseles rotan sin un botón de pausa visible. El banner no se detiene al tocar un punto en iPhone. | `components/home-hero-slider.tsx`, `app/home-featured-carousel.tsx` | Accesibilidad |
| A10 | Media | Encabezado, buscador y panel del carrito salen en Arial fuera de la ficha de producto. | `app/globals.css:26`, `components/site-header.tsx:155`, `components/cart-drawer.tsx:37` | Diseño |
| A11 | Media | En la ficha de mates y termos, «Sobre este producto» todavía usa colores azules. | `components/product-accordion.tsx:17`, `components/product-information.tsx:59-66` | Diseño |
| A12 | Media | La foto de la ficha hace saltar la página al cargar en escritorio (CLS 0,17). | `components/product-image-gallery.tsx:94-101` | Rendimiento |
| A13 | Media | Carrito, entrega y checkout muestran «vacío» un instante antes de cargar el carrito. | `store/cart-store.ts` y esas páginas | Rendimiento (ya estaba en la revisión anterior) |
| A14 | Media | Filtros de catálogo en celular horizontal: el panel queda de 48 px útiles. | `components/catalog/mobile-catalog-filters.tsx:80` | Celular |
| A15 | Media | La etiqueta «25% OFF · Transferencia · Efectivo» se corta en las tarjetas «Más en…» de la ficha a 768 y 1024 px. | `components/product-card.module.css:84-90` | Celular |
| A16 | Media | El error al calcular el envío aparece al pie, lejos del botón. Si hay una sola tarifa, igual hay que elegirla de una lista. | `app/checkout/page.tsx` | Experiencia de compra |
| A17 | Media | Home a 1366 px: franja blanca de 62 px al pie, con una hoja cortada. | `app/home-sections.module.css:3` | Diseño |
| A18 | Media | Faltan encabezados de seguridad: la pantalla del pedido se puede embeber en otro sitio y la respuesta revela que el sitio usa Next.js. | `next.config.ts` | Técnica |
| A19 | Media | Si falla la subida del comprobante, reintentar con otro archivo da error y la reserva queda trabada. | `services/checkout-payment-reports.ts`, migración `202610120001` | Técnica |
| A20 | Baja | Después de crear el pedido quedan claves de operación en la pestaña, y un pedido nuevo en esa pestaña puede fallar. | `app/checkout/page.tsx:162`, `services/orders.ts:52` | Técnica |
| A21 | Baja | El botón «Stock máximo en carrito» se anuncia como «Agregar … al carrito». «Mi carrito» se anuncia con otro nombre. | `components/add-to-cart-button.tsx:85`, `components/site-header.tsx:180` | Textos y accesibilidad |
| A22 | Baja | Los errores de los formularios se leen dos veces con lector de pantalla. | entrega y checkout | Accesibilidad (ya estaba) |
| A23 | Baja | No hay enlace «Saltar al contenido». Los menús abiertos con el mouse no se cierran con Escape. Los cambios de cantidad no se anuncian. «Tu carrito 1» no dice que el número es la cantidad de productos. | varios | Accesibilidad |
| A24 | Baja | Plurales fijos («1 productos sugeridos», «1 conjuntos»), «lunes a sábados», «...» en lugar de «…», «Porta mate», falta el punto final del aviso de cookies. | varios | Textos |
| A25 | Baja | En la tarjeta del catálogo, «Desde» aparece tachado junto con el precio de lista. | `components/product-grid.tsx:121` | Diseño |
| A26 | Baja | Enlaces chicos: «← Perfumes», «Inicio» y la dirección en Ayuda miden de 16 a 20 px de alto. | varios | Diseño y celular |
| A27 | Baja | En horizontal, los dos botones flotantes tapan un tercio de la pantalla y la foto de la ficha ocupa todo el alto. | `components/whatsapp-floating-button.module.css` | Celular |
| A28 | Baja | Código muerto: lectura vieja de pedidos, Mercado Pago heredado y la ruta `/checkout/cancelado`. | `services/checkout-order-read.ts`, `lib/payments/legacy-mercadopago/*` | Técnica |

## B. Requieren decisión del propietario

| # | Tema | Situación | Propuesta |
|---|---|---|---|
| B1 | Efectivo o solo transferencia | Las tarjetas y la ficha dicen «25% OFF · Efectivo / Transferencia» o «Transferencia · Efectivo». Ayuda, carrito y checkout hablan solo de transferencia, y el checkout no ofrece efectivo. | Definir la regla y usar una sola fórmula en todos lados. |
| B2 | «Accesorios» | El menú «Accesorios» lleva a cargadores y cables. La tarjeta «Accesorios materos» de la Home lleva a todos los mates, igual que la tarjeta «Mates». | Renombrar `/accesorios`, por ejemplo a «Cargadores y cables», y apuntar «Accesorios materos» a su filtro. |
| B3 | Nombre de la sección mates | Aparece como «Mates», «Todo matero», «Mates y termos», «Mates y accesorios» y «Mates, termos y accesorios». | Usar un solo nombre. |
| B4 | «Transferencia bancaria» | El destino del pago es una billetera virtual (Naranja X). | Decir «Transferencia (desde tu banco o billetera virtual)». |
| B5 | Contacto durante la compra | En entrega, checkout y la pantalla del pedido no hay ninguna vía de WhatsApp en el celular. | Agregar un enlace discreto «¿Dudas? Escribinos por WhatsApp». En la pantalla del pedido, que el mensaje incluya el número de pedido. |
| B6 | Comprobante en lenguaje claro | Hoy dice «No hay un pedido autorizado», «Reserva finalizada», «no constituye acreditación» y «Consultar comprobante privado». | Ver las propuestas en el informe de textos. |
| B7 | Cotización manual | Se muestra un código interno (UUID) y el seguimiento depende de volver a tocar un botón en la misma sesión. | Mensaje claro y enlace a WhatsApp con el número de solicitud. |
| B8 | Formato de importes | El checkout muestra «$ 8.250,00» y el resto del sitio «$ 8.250». | Usar un solo formato. |
| B9 | Títulos | Carrito y checkout no llevan la línea oliva ni la escala de títulos del catálogo. Los títulos de sección de la Home no siguen un patrón común. «LOS MÁS ELEGIDOS DE SF STORE» separa la marca en dos palabras. | Unificar la escala de títulos y escribir la marca «SFSTORE». |
| B10 | Contador del carrito | Es el único rojo vivo del sitio. | Confirmar que es intencional o pasarlo a un token. |
| B11 | Caché del catálogo | El catálogo se lee completo en cada visita. | Guardarlo 60 segundos (el checkout igual vuelve a validar precio y stock). Afecta la regla de «stock en el momento». |

## C. Rendimiento (otra etapa, cambios más grandes)

- La ficha encadena unas cinco consultas antes de mostrarse. Los productos relacionados frenan toda la página y los combos repiten consultas.
- La primera foto de cada catálogo se carga tarde (carga diferida y prioridad baja).
- Fotos sobredimensionadas:
  - «¿Qué estás buscando?»: 343 KB para mostrarlas a 147 px.
  - Banner móvil: imagen vertical recortada a cuadrada.
  - Fotos de producto: 900×1200 en tarjetas de 166 px.
- Datos de producto completos en cada tarjeta. La Home renderiza cada tarjeta dos veces.
- Configuración de entrega:
  - Fuente Geist Mono cargada sin usarse.
  - Imágenes de `public/` sin caché.
  - Fotos de producto con caché de 1 hora, cuando podrían tener 1 año.

## D. Lo que ningún revisor pudo verificar

- Pedidos reales: tarifas, cotización, carga del comprobante y pantalla del pedido con pedido. Todo eso necesita enviar datos, y estaba prohibido.
- Lectores de pantalla y Safari en iPhone reales, y las muescas de pantalla.
- El aviso de cookies, que no aparece en la vista previa.
- Fotos y textos reales del catálogo, y la página Accesorios con productos.
- El peso real del sitio en producción (no se compiló) y la latencia real de Supabase.

## Estado del grupo A (corregido el 21/11, sin commits)

### Corregidos

- A1, A2, A3, A4, A6, A7, A8, A10, A11, A13, A14, A15, A16, A17, A18, A20, A21, A22, A23, A24, A25 y A27.
- A9, parcial: tocar o enfocar un carrusel lo detiene, también en iPhone. El botón de pausa visible se quitó por pedido del propietario (23/11).
- A5: queda el ahorro exacto con centavos, por decisión del propietario (23/11).
- A12, parcial: el salto de la ficha bajó de 0,17 a 0,05. Mientras carga, la foto reserva un recuadro 3:4, el formato de las fotos del catálogo. Lo que queda viene de la foto de prueba, que es cuadrada. Con fotos reales 3:4 no debería haber salto.
- A26: las migas de la ficha miden 44 px. El enlace de la dirección en Ayuda queda como está, porque está dentro de una frase y eso es una excepción de WCAG 2.5.8.
- A28, parcial: `/checkout/cancelado` se reemplazó por `/checkout/entrega` en la lista de páginas de la analítica.
- Pruebas: `tests/public-review-20261121.test.mjs`, más ajustes en las pruebas existentes. Suite: 1.130 pruebas, 1.106 aprobadas, 0 fallas y 24 omitidas. tsc 0; ESLint 0 errores.

### Pendientes de decisión

- A19, comprobante trabado: ahora se explica el problema («Ya empezaste a informar el pago con otro archivo…»). Permitir reemplazar el archivo requiere una migración de base de datos del flujo de pago.
- A28, código muerto:
  - `lib/payments/legacy-mercadopago/*`: hay cuatro pruebas que leen su código.
  - `services/checkout-order-read.ts`: tiene su propia batería de seguridad (`sec01`).
  - Borrarlos toca pagos y pruebas de seguridad, así que se deja para confirmar.
