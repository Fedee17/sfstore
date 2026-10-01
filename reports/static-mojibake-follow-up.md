# Mojibake estático pendiente

Esta lista registra textos estáticos con mojibake detectados durante la corrección de descripciones de productos. No forman parte del flujo que escribe `products.description` y no fueron modificados en esta fase.

- `components/product-grid.tsx`: estado vacío del catálogo.
- `app/layout.tsx`: descripción y palabras clave de metadata.
- `app/producto/[slug]/page.tsx`: metadata y textos de detalle del producto.
- `app/producto/[slug]/product-actions.tsx`: acciones y ayuda del producto.
- `app/checkout/pendiente/page.tsx`: mensajes del pago pendiente.
- `app/checkout/fallo/page.tsx`: mensajes del pago fallido.

Tarea posterior: corregir los literales como UTF-8, revisar visualmente cada ruta y agregar una prueba que impida reintroducir patrones `Ã`, `Â`, `â` o `�` en textos estáticos.
