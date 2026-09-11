# Modelo de catalogo

Este documento describe el modelo operativo vigente del catalogo de SFSTORE. No define compras, caja ni historiales futuros.

## Entidades

- `products` es la entidad central. `slug` identifica la URL comercial y es unico; `sku` es un identificador operativo opcional y tambien es unico.
- `categories` clasifica cada producto mediante `products.category_id`.
- `product_attributes` guarda atributos comerciales repetibles como pares `name` / `value`. Las claves administradas se definen en `lib/catalog/attribute-config.ts`.
- `product_images` guarda las imagenes; una puede marcarse como principal.
- `inventory_movements` existe para registrar cambios de stock, pero el saldo todavia puede editarse directamente desde Productos. El historial no es completo hasta que todos los cambios sean obligatoriamente movimientos.

## Semantica de campos

- `price`: precio de lista vigente.
- `transfer_price`: precio vigente para efectivo o transferencia. Puede ser nulo si no existe un precio especial.
- `cost`: costo efectivo vigente. Cuando se implemente Compras, sera el ultimo costo efectivo de compra: costo del proveedor mas envio distribuido por unidad recibida.
- `stock`: saldo actual entero. No se permiten saldos negativos.
- `status`: estado comercial `draft`, `active` o `archived`.
- `featured`: determina si el producto se destaca en la experiencia publica.
- `name`: nombre visible y editable.
- `slug`: identificador URL estable y unico.
- `sku`: codigo operativo opcional y unico.
- `category_id`: relacion obligatoria con `categories`.

## Pendientes deliberados

- No existe historial de precios ni costos. Debe agregarse en una fase posterior, antes de depender del admin para auditorias comerciales.
- No se modifica ni normaliza automaticamente ningun atributo existente en esta fase.
- La consulta rapida lee el catalogo real y no replica datos de Google Sheets.

## Auditoria de atributos (2026-09-11)

La lectura del catalogo de Production se realizo sin escrituras.

- Perfumes: 62 productos. `Tipo` aparece en 62, `Proveedor` en 19 y `Marca` en 14.
- Mates: 22 productos. `Tipo` aparece en 22 y `Marca` en 1.
- Termos: 13 productos. `Tipo` aparece en 13.
- No hay registros para las claves administradas `commercial_category`, `olfactory_family`, `intensity`, `occasion`, `gender`, `decant_available`, `mate_type`, `material`, `color` o `use_case`.
- No se encontraron variantes por mayusculas o tildes de esas claves administradas. Los atributos legacy `Tipo`, `Proveedor` y `Marca` se conservan sin normalizar.

La consulta rapida busca sobre todos los atributos existentes, pero solo muestra un filtro especifico cuando una clave administrada tiene valores reales.
