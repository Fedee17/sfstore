# Supabase Storage para imagenes de productos

## Bucket requerido

Crear manualmente un bucket en Supabase Storage llamado:

```text
product-images
```

El bucket debe ser publico para que las imagenes puedan mostrarse en la tienda.

## Como crearlo

1. Entrar al proyecto en Supabase.
2. Ir a Storage.
3. Seleccionar New bucket.
4. Usar el nombre `product-images`.
5. Activar Public bucket.
6. Guardar.

## Uso en SFSTORE

El admin sube la imagen principal desde el formulario de producto. La imagen se guarda en una ruta similar a:

```text
products/[productId]/main-[timestamp].[ext]
```

Luego se crea un registro en `product_images` con:

```text
product_id
url
alt
sort_order = 0
is_primary = true
```

Si el producto ya tenia una imagen principal, las anteriores se marcan como `is_primary = false` y la nueva queda como principal.

## Formatos recomendados

- JPG
- PNG
- WebP

Antes de lanzar, revisar que las imagenes esten optimizadas para web.
