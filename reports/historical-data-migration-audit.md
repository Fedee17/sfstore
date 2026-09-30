# Auditoría de migración histórica de SFSTORE

> Análisis de solo lectura. No se escribieron datos en Supabase ni se modificó el Excel.

## Resumen

- Archivo: `C:\dev\sfstore\data\SFSTORE_control_emprendimiento_.xlsx`
- Tamaño: 146.826.044 bytes.
- Modificado: 2026-09-23T04:22:49.291Z.
- Hojas: 7.
- Ventas históricas válidas: 131 líneas.
- Líneas de compra detectadas: 180; 174 con fecha válida y 6 pendientes de revisión por fecha ausente/inválida.
- Rango de ventas: 2025-05-21 a 2026-09-23.
- Rango de compras: 2025-06-20 a 2026-07-30.
- Productos históricos únicos: 190.
- Proveedores auxiliares únicos: 11; las líneas de compra no tienen proveedor.
- Facturación histórica calculable: $4093365.00.
- Total histórico comprado de las 180 líneas: $7043595.70; subtotal con fecha válida: $6893805.70.

## Estructura del libro

| Hoja | Filas | Columnas | Filas no vacías (sin encabezado) | Encabezados | Propósito |
|---|---:|---:|---:|---|---|
| Precios Productos | 147 | 13 | 146 | 8; Producto; Costo unitario; PORCENTAJE GANANCIA; PRECIO CON DESCUENTO; Columna 6; DESCUENTO; PRECIO LISTA; ¿Es rentable?; Ganancia por unidad; STOCK; USD:; 1536.6 | Catálogo y precios de referencia; no contiene operaciones históricas individualizadas. |
| Producto Perfumes | 63 | 10 | 47 | Fe; Producto; Costo unitario; Margen (%); Precio de venta; Proveedor; Descuento; Precio final con descuento; ¿Es rentable?; Ganancia por unidad | Catálogo de perfumes, costos/precios y proveedor de referencia; no es un libro de compras. |
| Termos y Mates | 70 | 5 | 67 | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------; Producto; Precio de venta; Descuento; Precio final con descuento | Catálogo y precios de referencia. |
| Lista de precios proveedores | 112 | 9 | 88 | FOTO; PRODUCTO; TIPO; Proveedor; PRECIO; Dirección; Sitio web; Fiabilidad; Notas | Lista auxiliar de ofertas/proveedores, no evidencia de compras realizadas. |
| Pedidos Perfumes Árabes | 1024 | 12 | 7 | Column 6; (vacío 2); NOMBRE; PRECIO USD PY; PRECIO USD; CANT; PRECIO ARS; PRECIO PÚBLICO; (vacío 9); (vacío 10); Total Pedido USD; Total Pedido ARS | Planificación/cotización de pedido sin fecha ni identificador; no puede considerarse compra confirmada. |
| Control de compras | 181 | 10 | 180 | Foto Producto; Fecha; Nombre; Cantidad; Precio Unitario; Total; Total USD; Envío; (vacío 9); (vacío 10) | Historial principal de líneas de compra. |
| Control de ventas | 1045 | 19 | 303 | Fecha; Producto; Cantidad vendida; Precio unitario; Total venta; Tipo de pago; GANANCIA; DEBE; (vacío 9); Venta total; Ganancia total; (vacío 12); (vacío 13); Producto; Ventas; (vacío 16); TOP 5 PRODUCTOS; (vacío 18); (vacío 19) | Historial principal de líneas de venta; columnas laterales contienen tableros auxiliares. |

Las dimensiones incluyen áreas formateadas y tableros laterales. Los conteos transaccionales se calcularon solo con las columnas principales y exigiendo fecha y producto.

## Semántica transaccional

### Ventas

`Control de ventas` usa A:H: Fecha, Producto, Cantidad vendida, Precio unitario, Total venta, Tipo de pago, GANANCIA y DEBE. No hay identificador de venta, hora, cliente, canal, observaciones ni descuento explícito. Cada fila es una línea; no existe evidencia suficiente para agrupar varias filas del mismo día como una sola venta.

### Compras

`Control de compras` usa B:H: Fecha, Nombre, Cantidad, Precio Unitario, Total, Total USD y Envío. No hay identificador, proveedor ni observaciones. Cada fila representa una línea de compra/reposición; no es seguro agrupar por fecha.

`Pedidos Perfumes Árabes` es planificación/cotización: carece de fecha, estado e identificador de recepción. Debe quedar fuera de la importación histórica hasta una decisión humana.

### Muestras sanitizadas

| Fuente | Fecha | Producto | Cantidad | Unitario | Total | Dato adicional |
|---|---|---|---:|---:|---:|---|
| Venta | 2025-05-21 | AURICULAR JBL HARMAN | 1 | 35320.00 | 35320.00 | Transferencia |
| Venta | 2025-05-22 | VAPE IGNATE  V150 | 1 | 20490.00 | 20490.00 | Transferencia |
| Venta | 2025-06-13 | BOTELLAS STANLEY 650ML | 1 | 20000.00 | 20000.00 | Transferencia |
| Compra | 2025-06-20 | Botella Térmica BOTELLAS STANLEY 650ML | 5 | 22000.00 | 110000.00 | Envío:  |
| Compra | 2025-06-20 | PARLANTE JBL GO3 | 5 | 16160.00 | 80800.00 | Envío:  |
| Compra | 2025-06-20 | AURICULAR JBL HARMAN | 5 | 17660.00 | 88300.00 | Envío:  |

## Fechas

Las fechas reales son seriales numéricos de Excel con formatos `d/M/yyyy` o `d/MM/yyyy`. No contienen hora. Deben convertirse a un campo SQL `date` usando año/mes/día del serial; convertir primero a `Date` JavaScript introduce un desplazamiento horario y puede alterar el día.

## Calidad de datos

| Anomalía | Ventas | Compras |
|---|---:|---:|
| Filas del rango sin transacción válida en columnas principales | 913 | 6 |
| Fecha inválida/ausente con producto | 0 | 6 |
| Fecha válida sin producto | 0 | 0 |
| Cantidad ausente o <= 0 | 0 | 0 |
| Cantidad no entera | 0 | 0 |
| Precio/costo cero | 2 | 0 |
| Precio/costo negativo | 0 | 0 |
| Total cero | 2 | 0 |
| Total negativo | 0 | 0 |
| Total distinto de cantidad x precio/costo | 4 | 0 |
| Filas dentro de grupos exactamente repetidos | 10 | 0 |
| Filas del rango de compras sin producto | - | 0 |
| Envío informado y distinto de cero | - | 5 |

Grupos de ventas exactamente repetidas: 5. Grupos de compras exactamente repetidas: 0. Sin un ID/hora, son duplicados posibles, no eliminaciones automáticas.
Medios de pago observados: Transferencia: 73; Efectivo: 56; Crédito: 1; Débito: 1.

### Compras sin fecha

| Fila | Producto | Cantidad | Costo unitario | Total |
|---:|---|---:|---:|---:|
| 154 | Bombilla de alpaca y bronce cincelada | 1 | 11900.00 | 11900.00 |
| 155 | Camionero Criollo Base de Cuero | 1 | 8500.00 | 8500.00 |
| 156 | Combo 5 imperiales algarrobo acero + 5 pico loro | 5 | 9998.00 | 49990.00 |
| 157 | Imperial Con Refuerzo Alpaca Y Base De Bolitas | 1 | 22900.00 | 22900.00 |
| 158 | Termo Media Manija Negro | 3 | 12500.00 | 37500.00 |
| 159 | Torpedo Criollo Con Base | 1 | 19000.00 | 19000.00 |

### Totales de venta inconsistentes

| Fila | Fecha | Producto | Cantidad x precio | Total informado |
|---:|---|---|---:|---:|
| 40 | 2025-10-20 | Lattafa Musamam White Intense | 77500.00 | 74787.50 |
| 91 | 2026-05-13 | Decant Bharara king | 11000.00 | 11670.00 |
| 92 | 2026-05-13 | Decant dubai nigth | 11000.00 | 11670.00 |
| 93 | 2026-05-13 | Decant 9 pm elixir | 11000.00 | 11670.00 |

### Grupos de ventas exactamente repetidas

- Filas 13, 14.
- Filas 16, 20.
- Filas 36, 37.
- Filas 70, 71.
- Filas 79, 82.

### Variantes históricas por mayúsculas, tildes o espacios (4 grupos)

- Camiseta ARGENTINA Bordada / Camiseta ARGENTINA BORDADA
- Lattafa Yara rosa / Lattafa Yara Rosa
- Mate Algarrobo Acrilico / Mate Algarrobo Acrílico
- Termo pico system / Termo Pico System

## Matching de productos

Solo se usaron nombre exacto, normalización determinista y los aliases explícitos ya versionados. No se aplicó fuzzy matching automático.

| Tipo | Nombres únicos |
|---|---:|
| EXACT_MATCH | 137 |
| NOT_FOUND | 45 |
| AMBIGUOUS | 3 |
| NORMALIZED_MATCH | 3 |
| ALIAS_MATCH | 2 |

### AMBIGUOUS (3)

- Lattafa Yara rosa: La normalización coincide con varios productos. Candidatos: Lattafa Yara Rosa (05b34469-3eb8-4148-8e97-9a19f1c2df6e), Lattafa Yara Rosa (f1cb2323-0e7f-49d6-a26f-110595c90e55).
- Lattafa Yara Rosa: Más de un producto con nombre idéntico. Candidatos: Lattafa Yara Rosa (05b34469-3eb8-4148-8e97-9a19f1c2df6e), Lattafa Yara Rosa (f1cb2323-0e7f-49d6-a26f-110595c90e55).
- Lattafa Yara Tous: Más de un producto con nombre idéntico. Candidatos: Lattafa Yara Tous (e53066cc-9c35-47e2-8d27-0fe5fb425ce8), Lattafa Yara Tous (ef80b721-2c20-466d-8584-a9ab852dd6ca).

### NOT_FOUND (45)

- AFNAN 9PM BLACK MEN EDP 100ML: Sin coincidencia exacta, normalizada ni alias aprobado.
- AFNAN 9PM REBEL 100ML EDP: Sin coincidencia exacta, normalizada ni alias aprobado.
- Airpods: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: AIRPODS PRO 2 (e73c5890-d0a0-4805-a558-cb3b7030ab30, similitud 0.54).
- ASAD BLACK - 100ML: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: HOMME BLACK - 100ML (c6ab646e-ea3c-4ca9-928a-3f518e49f5e6, similitud 0.71); YARA ELIXIR - 100ML (919056a3-1dc9-4ae0-9f90-fbba8cf58be9, similitud 0.53).
- Asad Lattafa Masculino 100ml: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: LATTAFA MAYAR - 100ML (f044976f-c174-445b-8349-d5c62c424a56, similitud 0.57); LATTAFA ASAD (bd7930a6-65c3-4e3b-b85f-1cb1b56d6835, similitud 0.50); LATTAFA KHAMRAH - 100ML (aa3a931a-ef24-40b9-b65b-d2e2acd87a2b, similitud 0.50).
- Bharara King 100ml Masculino: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: BHARARA King Parfum (72917d13-012c-4ea2-a05a-7c324ef38b3c, similitud 0.54); BHARARA King (5b729e4c-e54e-4e59-985f-42e3ce60e30d, similitud 0.50).
- Bombilla plana stanley: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Bombilla Pico de Loro (96f90d2b-185b-4f47-a155-184619a8b6e3, similitud 0.50).
- CABEZAL 20W USB-C: Sin coincidencia exacta, normalizada ni alias aprobado.
- CABEZAL 20W USB-C	 
ORIGINAL: Sin coincidencia exacta, normalizada ni alias aprobado.
- Canasta matera: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Canasta matera 100% cuero (3e33942f-1d42-4b03-b30d-97da131b2cba, similitud 0.58); Canasta simil cuero (4d304204-8569-464a-b856-29a84bdee6c8, similitud 0.58).
- Decant Game of Spades Full House: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Decant Game of Spades Full House 5ml (8d828391-4a86-4eb9-bb6a-f384bc3e1d7d, similitud 0.89).
- Decant hawas Kobra: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Decant hawas Kobra 5ml (8f06198a-0199-407d-9d5d-9e7c38bcd578, similitud 0.82); Decant hawas fire (f91c4caa-32bb-4450-8a87-25422095257b, similitud 0.78); Decant hawas black (50282266-0dd6-4864-bfdb-bbc6c5aec91a, similitud 0.72).
- Decant hawas malibu: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Decant hawas malibu 5ml (0be4f17b-4888-466f-ad13-3643a645f730, similitud 0.83); Decant hawas black (50282266-0dd6-4864-bfdb-bbc6c5aec91a, similitud 0.74); Decant hawas elixir (2db67b25-6e37-446a-8e98-5f626d5efc63, similitud 0.74).
- Decant hawas tropical: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Decant hawas tropical 5ml (fe29c305-f0f8-4752-855c-c785be1046ac, similitud 0.84); Decant hawas black (50282266-0dd6-4864-bfdb-bbc6c5aec91a, similitud 0.67); Decant hawas elixir (2db67b25-6e37-446a-8e98-5f626d5efc63, similitud 0.67).
- Decants Muestras: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Decant 9 AM (39dc1190-b773-4430-9bb8-9fb37cce1a21, similitud 0.50); Decant 9 pm elixir (e0d493ea-6aa8-4127-8199-f171e829dda1, similitud 0.50).
- Desodorante Asad: Sin coincidencia exacta, normalizada ni alias aprobado.
- Dolce and Gabbana Light Blue 60ml: Sin coincidencia exacta, normalizada ni alias aprobado.
- Elfbar BC 15k: Sin coincidencia exacta, normalizada ni alias aprobado.
- Ignite V150: Sin coincidencia exacta, normalizada ni alias aprobado.
- Imperial Algarrobo Acero + Bombilla pico de loro: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Bombilla Pico de Loro (96f90d2b-185b-4f47-a155-184619a8b6e3, similitud 0.57); Combo 5 imperiales algarrobo acero + 5 pico loro (e781712d-5839-4d63-b648-13a2dfee6a71, similitud 0.54); Bombilla pico de loro corta (c5a353af-8b98-4980-b317-419adeed702d, similitud 0.50).
- Imperial Con Refuerzo Alpaca Y Base De Bolitasperial + Bombilla Pico de Loro: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Imperial Con Refuerzo Alpaca Y Base De Bolitas (c79ee2ec-e006-4be2-b54a-da869542b698, similitud 0.62).
- Imperial cuero liso virola en acero y bronce con bolitas: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Mate Imperial cuero liso virola acero y bronce con botitas (9c05ba0b-731a-4701-80e6-450c1a4552fb, similitud 0.84); Imperial Con Refuerzo Alpaca Y Base De Bolitas (c79ee2ec-e006-4be2-b54a-da869542b698, similitud 0.52).
- Lata Matera: Sin coincidencia exacta, normalizada ni alias aprobado.
- Lattafa Asad Masculino 100ml: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: LATTAFA KHAMRAH - 100ML (aa3a931a-ef24-40b9-b65b-d2e2acd87a2b, similitud 0.57); LATTAFA MAYAR - 100ML (f044976f-c174-445b-8349-d5c62c424a56, similitud 0.57); Lattafa Asad Bourbon (13627ebe-ca04-46e0-9d26-d2861d1ee4a5, similitud 0.54).
- Lattafa Fakhar Gold Edition Alternativo: Sin coincidencia exacta, normalizada ni alias aprobado.
- Lattafa Opulence Dubai: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Lattafa Opulent Dubai (65027262-d36d-4230-a859-40a007489bfa, similitud 0.91); Lattafa Pride Nebras (1354e3bc-2fa3-486d-a43a-d38da696f160, similitud 0.55); Opulent Dubai (917dd573-dc58-435a-85a4-c6b55bcd7ffc, similitud 0.55).
- Mate Algarrobo Simple: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Mate Algarrobo Acrilico (5c0709ee-5299-433f-af37-628d4efa09ff, similitud 0.70).
- Mate Pampa Original boca abierta: Sin coincidencia exacta, normalizada ni alias aprobado.
- ODYSSEY MANDARIN SKYBOTELLA FLIP KENCHER 900ML: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: BOTELLA FLIP KENCHER 900ML (ea5850cf-f751-422e-96d1-ca255a1e80a6, similitud 0.57).
- PAVA ELECTRICA: Sin coincidencia exacta, normalizada ni alias aprobado.
- Porta mate cuero: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Porta mate cuero Marrón (a2843178-0691-4a35-bb30-b475b3e941ff, similitud 0.75); Porta mate cuero Marrón Oscuro (165c4d74-286a-4882-9370-e47001f85e95, similitud 0.60); Canasta matera 100% cuero (3e33942f-1d42-4b03-b30d-97da131b2cba, similitud 0.54).
- SECAPLATO: Sin coincidencia exacta, normalizada ni alias aprobado.
- Termo Media Manija Negro: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Termo media manija negro 1L (b223e3e9-3bb6-4da9-8a62-a03a4fd994e0, similitud 0.89); Termo de acero negro (cd5debfb-af46-45a5-9c20-ecf6bbb27c53, similitud 0.63).
- Termo media manija negro tapa plateada 1L: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Termo media manija negro 1L (b223e3e9-3bb6-4da9-8a62-a03a4fd994e0, similitud 0.71).
- Termo media manija plateada 1L: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Termo media manija negro 1L (b223e3e9-3bb6-4da9-8a62-a03a4fd994e0, similitud 0.77).
- TERMO STANLEY Verde: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: TERMO STANLEY (cb2f395b-d009-4358-9678-f5c892bc5c4d, similitud 0.68); BOTELLAS STANLEY 650ML (2e066864-97a0-4695-b484-3ef62b869dd1, similitud 0.50).
- VAPE ELFBAR 30K: Sin coincidencia exacta, normalizada ni alias aprobado.
- VAPE IGNATE  V150: Sin coincidencia exacta, normalizada ni alias aprobado.
- VAPE IGNATE  V151: Sin coincidencia exacta, normalizada ni alias aprobado.
- Vaper Ignite V150: Sin coincidencia exacta, normalizada ni alias aprobado.
- Vaso Cervecero Liso: Sin coincidencia exacta, normalizada ni alias aprobado.
- Vaso Cervecero Stanley: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: TERMO STANLEY (cb2f395b-d009-4358-9678-f5c892bc5c4d, similitud 0.50).
- Versace 30ml: Sin coincidencia exacta, normalizada ni alias aprobado.
- YARA CLASICO - 100ML: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: YARA ELIXIR - 100ML (919056a3-1dc9-4ae0-9f90-fbba8cf58be9, similitud 0.72); HOMME BLACK - 100ML (c6ab646e-ea3c-4ca9-928a-3f518e49f5e6, similitud 0.50).
- Yara Tous Lattafa: Sin coincidencia exacta, normalizada ni alias aprobado. Sugerencias no vinculantes: Lattafa Yara Tous (e53066cc-9c35-47e2-8d27-0fe5fb425ce8, similitud 1.00); Lattafa Yara Tous (ef80b721-2c20-466d-8584-a9ab852dd6ca, similitud 1.00); Lattafa Yara Candy (a6158818-9fa9-4762-a98f-06d6f7a8afb3, similitud 0.50).

## Matching de proveedores

Las compras históricas no informan proveedor. El siguiente matching corresponde únicamente a nombres auxiliares de `Producto Perfumes` y `Lista de precios proveedores`; no permite asignar proveedor a una compra histórica.

| Tipo | Nombres únicos |
|---|---:|
| NOT_FOUND | 11 |

- ALBA IMPORTADOS: NOT_FOUND.
- COLD IMPORTADOR DIRECTO: NOT_FOUND.
- DE TODO UN POCO STOCK: NOT_FOUND.
- ER MAYORISTA: NOT_FOUND.
- IMPORTADO STORE: NOT_FOUND.
- IMPORTADOK 4 THE LUXE KIKE: NOT_FOUND.
- MAYORISTA JUAN CICCIARI: NOT_FOUND.
- NEW RED: NOT_FOUND.
- NEXUS: NOT_FOUND.
- PRODUCTOS TENDENCIA: NOT_FOUND.
- REVOLEOS OFICIAL: NOT_FOUND.

## Posibles duplicados contra Supabase

- Ventas: 0 filas del Excel tienen al menos un candidato por fecha, producto, cantidad, precio y subtotal.
- Compras: 0 filas del Excel tienen al menos un candidato por fecha, producto, cantidad, costo y total.
Estas coincidencias son candidatas, no pruebas concluyentes: el Excel carece de ID y hora. El dry-run debe omitir automáticamente solo claves históricas ya importadas por el propio proceso; los candidatos preexistentes requieren revisión humana.

## Costos históricos

Productos actuales con una compra histórica fechada y determinísticamente vinculada: 130.
Entre las 180 líneas de compra hay 3 nombres ambiguos y 29 no encontrados. Las seis filas sin fecha se conservan como revisión y no participan del cálculo de costo histórico más reciente.
El costo histórico usado es `Precio Unitario`. El campo `Envío` no puede distribuirse de manera fiable por producto sin una compra agrupada/identificador. No se recomienda actualizar `products.cost` desde esta fuente.

| Producto | Última compra histórica | Cantidad | Costo histórico | Costo actual | Clasificación | Compra confirmada Supabase más reciente |
|---|---|---:|---:|---:|---|---|
| 5 Camioneros de algarrobo + 5 Bombillas Chatas | 2026-04-15 | 5 | 7700.00 | 7700.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Acqua di Gio Armani Premium Caballero 100ml | 2025-09-02 | 1 | 18900.00 | 18900.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Afnan 9 AM DIVE | 2025-10-14 | 1 | 42190.00 | 42190.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Afnan 9 PM Elixir | 2026-01-22 | 1 | 58280.00 | 68000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Afnan Turathi Blue | 2025-10-14 | 1 | 51041.50 | 51041.50 | HISTORICAL_COST_MATCHES_CURRENT | - |
| AIRPODS PRO 2 | 2025-12-17 | 5 | 15350.00 | 15682.90 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| AIRPODS PRO MAX | 2025-06-20 | 5 | 21840.00 | 25500.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Al Haramain Amber Oud Gold Edition | 2026-04-30 | 1 | 62496.00 | 78432.90 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Al Haramain dubai night | 2026-06-23 | 1 | 64740.00 | 69205.50 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| AURICULAR JBL HARMAN | 2025-06-20 | 5 | 17660.00 | 17660.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Auriculares Inalámbricos In-Ear A6S | 2025-08-21 | 10 | 5845.00 | 5845.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Autocebante 2 en 1 | 2026-04-15 | 1 | 13500.00 | 13500.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Badee Al Oud For Glory (Black) | 2025-10-14 | 1 | 37764.25 | 37764.25 | HISTORICAL_COST_MATCHES_CURRENT | - |
| BATTERY PACK | 2025-06-20 | 5 | 14650.00 | 14650.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| BHARARA King | 2025-10-14 | 1 | 75629.00 | 75629.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| BHARARA King Parfum | 2025-11-04 | 1 | 78921.50 | 78921.50 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Bombilla pico de loro corta | 2026-02-12 | 1 | 3400.00 | 3400.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Bombilla pico de loro larga | 2026-02-12 | 1 | 3400.00 | 3400.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| BOMBILLAS | 2025-06-20 | 10 | 3700.00 | 3700.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Bombillón alpaca y bronce recto | 2026-02-12 | 2 | 15900.00 | 15900.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Bombillon Premium | 2026-03-20 | 1 | 17150.00 | 17150.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Bombillon Recto Cincelado | 2026-03-20 | 1 | 14650.00 | 14650.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| BOTELLA FLIP KENCHER 900ML | 2025-06-20 | 5 | 19000.00 | 19000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Botella Térmica BOTELLAS STANLEY 650ML | 2025-06-20 | 5 | 22000.00 | 22000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Box Argentina | 2026-03-20 | 3 | 14640.00 | 14640.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| BOX LOS SIMPSON | 2026-03-20 | 1 | 14640.00 | 14640.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Box Presentación | 2026-03-20 | 3 | 5650.00 | 5650.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| CABLE 20W IPHONE | 2026-03-05 | 10 | 3650.00 | 3650.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| CABLE USB - C CARGA RAPIDA | 2025-08-23 | 10 | 1439.00 | 1439.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Camiseta ARGENTINA BORDADA | 2026-03-05 | 2 | 18125.00 | 18125.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Camiseta ARGENTINA TAILANDESA | 2026-03-05 | 1 | 24650.00 | 24650.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Camiseta ARGENTINA TERMOSELLADA | 2026-03-05 | 2 | 21677.50 | 21677.50 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Canasta matera 100% cuero | 2026-02-12 | 1 | 20700.00 | 20700.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Canasta simil cuero | 2026-02-12 | 1 | 6500.00 | 6500.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| CARGADOR 3.8A  + CABLE TIPO C | 2025-08-22 | 10 | 2939.00 | 2939.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Club de Nuit Intense Man | 2026-06-23 | 1 | 54450.00 | 54450.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| CLUB DE NUIT SILLAGE | 2025-09-19 | 1 | 45600.00 | 56700.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| CONFIDENTIAL GOLD - 100M | 2026-04-08 | 1 | 38100.00 | 38100.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| CONFIDENTIAL GOLD - 100ML | 2026-07-30 | 1 | 31700.00 | 31700.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant 9 AM | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant 9 pm elixir | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant 9pm rebel | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant all' haramain amber oud gol edition | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Aqua Dubai | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Art of universe | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Asad bourbon | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Bharara king | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Bharara soleil | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Club de nuit iconic | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Club de nuit intense | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Club de nuit urban elixir | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant dubai nigth | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant hawas black | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant hawas elixir | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant hawas fire | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant hawas verde | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Lattafa Kahambra | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant liquid brun | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant odissey elixir | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Decant Rayhaan elixir | 2026-03-10 | 1 | 8000.00 | 8000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Despolvillador | 2026-03-20 | 3 | 4150.00 | 4150.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Dispenser de yerba en madera | 2026-03-20 | 1 | 13150.00 | 13150.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Fakhar Rose Gold | 2025-10-14 | 1 | 37975.00 | 54000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| French Avenue Liquid Broun | 2026-06-23 | 1 | 67680.00 | 67680.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Hawas Elixir | 2026-06-23 | 1 | 52980.00 | 55000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Hawas Fire Rasasi | 2025-11-04 | 1 | 57751.25 | 61500.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| HOMME BLACK - 100ML | 2026-07-30 | 1 | 42700.00 | 42700.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| HOPPY BOTON 650ML | 2025-06-20 | 3 | 14000.00 | 14000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| HOPPY BOTON 900ML | 2025-06-20 | 3 | 15000.00 | 15000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| LA VIVACITE INTESA - 100ML | 2026-04-08 | 1 | 39100.00 | 39100.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| LATTAFA ASAD | 2025-09-19 | 1 | 26300.00 | 49200.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Lattafa Asad Bourbon | 2026-05-11 | 1 | 52920.00 | 58500.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Lattafa Bade'e Al Oud Sublime | 2026-01-22 | 1 | 36717.20 | 41400.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Lattafa Eclaire | 2026-06-23 | 1 | 44160.00 | 53000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| LATTAFA KHAMRAH - 100ML | 2026-07-30 | 1 | 43700.00 | 43700.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| LATTAFA MAYAR - 100ML | 2026-04-08 | 1 | 42930.00 | 42930.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Lattafa Mayar Natural Intense | 2026-01-22 | 1 | 30345.00 | 38500.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Lattafa Musamam White Intense | 2025-10-15 | 1 | 67297.35 | 67297.35 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Lattafa Pride Nebras | 2025-12-17 | 1 | 42500.00 | 42500.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Lattafa Qaed Al Fursan | 2026-07-30 | 1 | 34700.00 | 34700.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Lattafa Yara Candy | 2026-05-11 | 1 | 36750.00 | 41700.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Lattafa Yara moi | 2026-01-22 | 1 | 31100.00 | 40600.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Mate Algarrobo Acrilico | 2026-01-22 | 1 | 14900.00 | 14900.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Camionero Argentina | 2026-03-20 | 1 | 8640.00 | 8640.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Camionero Harry Potter | 2026-03-20 | 1 | 8640.00 | 8640.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Camionero Messi | 2026-03-20 | 1 | 8640.00 | 8640.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Camionero Patagónia | 2026-03-20 | 1 | 8640.00 | 8640.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Camionero Ruta | 2026-03-20 | 1 | 8640.00 | 8640.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Camionero virola alpaca cincelada con apliques de bronce | 2026-02-12 | 1 | 16800.00 | 16800.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Camionero virola de acero inox | 2026-02-12 | 1 | 12900.00 | 12900.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Imperial algarrobo con grabado BOCA JUNIORS | 2026-03-20 | 1 | 11550.00 | 11550.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Imperial algarrobo con grabado RIVER PLATE | 2026-03-20 | 1 | 11550.00 | 11550.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Imperial Animal Print  virola cincelada con aplique | 2026-02-12 | 1 | 26400.00 | 26400.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Imperial Animal Print  virola lisa | 2026-02-12 | 1 | 24300.00 | 24300.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Imperial cuero liso virola acero y bronce con botitas | 2026-02-12 | 1 | 26500.00 | 26500.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Imperial Liso | 2026-02-12 | 1 | 17800.00 | 17800.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Imperial virola alpaca cincelada premium | 2026-02-12 | 1 | 19100.00 | 19100.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Torpedo alpaca cincelada cuero dibujado con botitas | 2026-02-12 | 1 | 24500.00 | 24500.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Torpedo animal print 100% cuero | 2026-02-12 | 1 | 27400.00 | 27400.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Torpedo animal print alpaca cincelada | 2026-02-12 | 1 | 25400.00 | 25400.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Torpedo base de cuero virola cincelada de bronce | 2026-02-12 | 1 | 24800.00 | 24800.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Mate Torpedo virola alpaca cincelada | 2026-02-12 | 1 | 16800.00 | 16800.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Odyseey Limoni | 2025-10-14 | 1 | 37975.00 | 40000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Odyssey Aqua | 2025-11-04 | 1 | 47639.00 | 57600.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Odyssey Artisto | 2025-11-04 | 1 | 50549.00 | 50549.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Odyssey Go Mango | 2025-11-04 | 1 | 75138.50 | 75138.50 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Odyssey Homme Black | 2026-05-11 | 1 | 34545.00 | 34545.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| ODYSSEY MANDARIN SKY | 2025-11-04 | 1 | 42037.25 | 48000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Odyssey Mega | 2025-11-04 | 1 | 38065.10 | 40500.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Odyssey Wild One | 2025-11-04 | 1 | 37745.00 | 41000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Opulent Dubai | 2025-10-14 | 1 | 27367.25 | 45000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| PARLANTE JBL GO3 | 2025-06-20 | 5 | 16160.00 | 16160.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| PHILOS PURA - 100ML | 2026-04-08 | 1 | 42300.00 | 42300.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Qaed Al Fursan Untamed | 2026-07-30 | 1 | 36000.00 | 36000.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| RASSASI HAWAS FOR HIM | 2026-01-22 | 1 | 36596.40 | 48000.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| SALVO ELIXIR - 60ML | 2026-07-30 | 1 | 38300.00 | 38300.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Sceptre Malachite Maison Alhambra | 2025-11-04 | 1 | 39636.50 | 39636.50 | HISTORICAL_COST_MATCHES_CURRENT | - |
| TEMPLADOS | 2025-06-20 | 50 | 1335.00 | 1950.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Termo de acero negro | 2026-01-22 | 2 | 16999.00 | 16999.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| TERMO MATESYSTEM | 2025-06-20 | 3 | 20200.00 | 20200.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Termo media manija negro 1L | 2026-03-20 | 2 | 12640.00 | 12640.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Termo Pico System | 2026-07-24 | 10 | 18500.00 | 20600.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| TRAVEL MANIJA | 2025-06-20 | 3 | 15200.00 | 15200.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Uomo itense | 2026-07-30 | 1 | 54400.00 | 54400.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Vulcan Feu French Avenue | 2025-11-04 | 1 | 71064.50 | 71064.50 | HISTORICAL_COST_MATCHES_CURRENT | - |
| YARA ELIXIR - 100ML | 2026-07-30 | 1 | 54500.00 | 54500.00 | HISTORICAL_COST_MATCHES_CURRENT | - |
| Yerba organica Sante molienda fina 1Kg | 2026-03-09 | 1 | 5000.00 | 5500.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Yerba organica Sante molienda fina 500g | 2026-03-09 | 1 | 2500.00 | 2750.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Yerba organica Sante molienda gruesa 1Kg | 2026-03-09 | 2 | 5000.00 | 5500.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |
| Yerba organica Sante molienda gruesa 500g | 2026-03-09 | 1 | 2500.00 | 2750.00 | HISTORICAL_COST_DIFFERS_CURRENT | - |

Resumen de clasificación:

- HISTORICAL_COST_MATCHES_CURRENT: 101
- NO_HISTORICAL_PURCHASE: 30
- HISTORICAL_COST_DIFFERS_CURRENT: 29
- AMBIGUOUS_PRODUCT_MATCH: 3 nombres históricos (`Lattafa Yara rosa`, `Lattafa Yara Rosa`, `Lattafa Yara Tous`), causados por productos duplicados actuales.
- Sin clasificación de costo por `NOT_FOUND`: 29 nombres históricos de compra; deben resolverse mediante mapping humano antes de un dry-run aplicable.

## Ventas históricas por producto

Solo se agregan productos con match determinista. El precio promedio es ponderado: facturación / unidades.

| Producto | Unidades | Facturación | Líneas de venta | Primera | Última | Precio promedio |
|---|---:|---:|---:|---|---|---:|
| AIRPODS PRO 2 | 6 | 212300.00 | 6 | 2025-07-09 | 2026-09-12 | 35383.33 |
| BHARARA King | 2 | 188700.00 | 2 | 2025-10-21 | 2026-03-12 | 94350.00 |
| AURICULAR JBL HARMAN | 5 | 170280.00 | 5 | 2025-05-21 | 2026-05-23 | 34056.00 |
| TERMO MATESYSTEM | 3 | 156550.00 | 3 | 2025-07-11 | 2025-12-18 | 52183.33 |
| ODYSSEY MANDARIN SKY | 2 | 116644.00 | 2 | 2025-10-01 | 2025-10-17 | 58322.00 |
| Termo media manija negro 1L | 4 | 113900.00 | 4 | 2026-04-16 | 2026-07-27 | 28475.00 |
| PARLANTE JBL GO3 | 3 | 111504.00 | 3 | 2025-06-15 | 2025-08-19 | 37168.00 |
| Termo Pico System | 3 | 101500.00 | 3 | 2026-07-24 | 2026-09-04 | 33833.33 |
| BHARARA King Parfum | 1 | 100000.00 | 1 | 2025-11-22 | 2025-11-22 | 100000.00 |
| COMBO CABEZAL Y CABLE 20W	  REPLICA AAA | 4 | 83250.00 | 4 | 2026-04-24 | 2026-07-31 | 20812.50 |
| Club de Nuit Intense Man | 1 | 81675.00 | 1 | 2026-09-04 | 2026-09-04 | 81675.00 |
| HOPPY BOTON 650ML | 3 | 79800.00 | 3 | 2025-12-22 | 2025-12-24 | 26600.00 |
| Lattafa Musamam White Intense | 1 | 74787.50 | 1 | 2025-10-20 | 2025-10-20 | 74787.50 |
| LATTAFA KHAMRAH - 100ML | 1 | 65000.00 | 1 | 2026-05-15 | 2026-05-15 | 65000.00 |
| Lattafa Pride Nebras | 1 | 63500.00 | 1 | 2026-04-07 | 2026-04-07 | 63500.00 |
| LATTAFA ASAD | 1 | 61500.00 | 1 | 2026-06-29 | 2026-06-29 | 61500.00 |
| LA VIVACITE INTESA - 100ML | 1 | 58650.00 | 1 | 2026-09-08 | 2026-09-08 | 58650.00 |
| CONFIDENTIAL GOLD - 100M | 1 | 57150.00 | 1 | 2026-05-09 | 2026-05-09 | 57150.00 |
| Termo de acero negro | 2 | 57000.00 | 2 | 2026-06-10 | 2026-06-26 | 28500.00 |
| Odyssey Mega | 1 | 55456.00 | 1 | 2026-05-02 | 2026-05-02 | 55456.00 |
| Bombillón alpaca y bronce recto | 2 | 54000.00 | 2 | 2026-03-22 | 2026-03-22 | 27000.00 |
| PHILOS PURA - 100ML | 1 | 53000.00 | 1 | 2026-04-09 | 2026-04-09 | 53000.00 |
| TRAVEL MANIJA | 2 | 50800.00 | 2 | 2025-12-16 | 2026-04-08 | 25400.00 |
| RASSASI HAWAS FOR HIM | 1 | 49840.00 | 1 | 2025-10-15 | 2025-10-15 | 49840.00 |
| Camiseta ARGENTINA TAILANDESA | 1 | 45000.00 | 1 | 2026-06-11 | 2026-06-11 | 45000.00 |
| Lattafa Qaed Al Fursan | 1 | 41993.00 | 1 | 2026-04-08 | 2026-04-08 | 41993.00 |
| BOTELLAS STANLEY 650ML | 2 | 40000.00 | 2 | 2025-06-13 | 2025-06-16 | 20000.00 |
| Canasta matera 100% cuero | 1 | 37000.00 | 1 | 2026-08-18 | 2026-08-18 | 37000.00 |
| Camiseta ARGENTINA BORDADA | 1 | 36000.00 | 1 | 2026-06-13 | 2026-06-13 | 36000.00 |
| BOX LOS SIMPSON | 1 | 36000.00 | 1 | 2026-07-15 | 2026-07-15 | 36000.00 |
| Bombillon Premium | 1 | 33442.50 | 1 | 2026-04-16 | 2026-04-16 | 33442.50 |
| Mate Imperial algarrobo con grabado RIVER PLATE | 1 | 31100.00 | 1 | 2026-04-11 | 2026-04-11 | 31100.00 |
| BOTELLA FLIP KENCHER 900ML | 1 | 31000.00 | 1 | 2026-07-29 | 2026-07-29 | 31000.00 |
| Mate Imperial virola alpaca cincelada premium | 1 | 29750.00 | 1 | 2026-09-23 | 2026-09-23 | 29750.00 |
| TERMO STANLEY | 1 | 29500.00 | 1 | 2026-07-27 | 2026-07-27 | 29500.00 |
| Mate Camionero virola alpaca cincelada con apliques de bronce | 1 | 28000.00 | 1 | 2026-03-22 | 2026-03-22 | 28000.00 |
| Mate Camionero Harry Potter | 1 | 26700.00 | 1 | 2026-08-04 | 2026-08-04 | 26700.00 |
| Despolvillador | 3 | 24000.00 | 3 | 2026-04-06 | 2026-04-09 | 8000.00 |
| Mate Algarrobo Acrilico | 1 | 23990.00 | 1 | 2026-04-16 | 2026-04-16 | 23990.00 |
| Auriculares Inalámbricos In-Ear A6S | 2 | 23500.00 | 2 | 2025-10-17 | 2026-03-07 | 11750.00 |
| CABLE 20W IPHONE | 3 | 23000.00 | 3 | 2025-12-01 | 2026-07-24 | 7666.67 |
| Canasta simil cuero | 1 | 19500.00 | 1 | 2026-05-13 | 2026-05-13 | 19500.00 |
| Box Presentación | 1 | 15000.00 | 1 | 2026-09-23 | 2026-09-23 | 15000.00 |
| CABLE USB - C CARGA RAPIDA | 3 | 14100.00 | 2 | 2025-12-21 | 2026-08-20 | 4700.00 |
| Decant hawas fire | 1 | 13000.00 | 1 | 2026-03-22 | 2026-03-22 | 13000.00 |
| CARGADOR 3.8A  + CABLE TIPO C | 2 | 11700.00 | 2 | 2026-03-17 | 2026-04-11 | 5850.00 |
| Decant liquid brun | 1 | 11670.00 | 1 | 2026-04-14 | 2026-04-14 | 11670.00 |
| Decant Art of universe | 1 | 11670.00 | 1 | 2026-04-14 | 2026-04-14 | 11670.00 |
| Decant Bharara king | 1 | 11670.00 | 1 | 2026-05-13 | 2026-05-13 | 11670.00 |
| Decant dubai nigth | 1 | 11670.00 | 1 | 2026-05-13 | 2026-05-13 | 11670.00 |
| Decant 9 pm elixir | 1 | 11670.00 | 1 | 2026-05-13 | 2026-05-13 | 11670.00 |
| Yerba organica Sante molienda gruesa 1Kg | 1 | 7500.00 | 1 | 2026-03-11 | 2026-03-11 | 7500.00 |
| Bombilla pico de loro larga | 1 | 6000.00 | 1 | 2026-04-25 | 2026-04-25 | 6000.00 |
| Yerba organica Sante molienda gruesa 500g | 1 | 5200.00 | 1 | 2026-06-30 | 2026-06-30 | 5200.00 |
| BOMBILLAS | 1 | 5000.00 | 1 | 2025-07-10 | 2025-07-10 | 5000.00 |
| Yerba organica Sante molienda fina 500g | 1 | 3750.00 | 1 | 2026-03-10 | 2026-03-10 | 3750.00 |
| Decant 9 AM | 1 | 0.00 | 1 | 2026-06-27 | 2026-06-27 | 0.00 |
| Decant Club de nuit iconic | 1 | 0.00 | 1 | 2026-06-27 | 2026-06-27 | 0.00 |

## Estado actual de Supabase consultado

- products: 160
- suppliers: 1
- purchases: 2
- purchase_items: 3
- orders: 3
- order_items: 6
- order_payments: 2
- inventory_movements: 6.

## Riesgos

- Stock: `confirm_purchase`, `complete_store_sale`, `deliver_order` y `apply_sale_inventory` son flujos operativos; invocarlos alteraría stock/movimientos.
- Costos: confirmar compras históricas actualizaría `products.cost` y su fuente.
- Duplicación: el Excel no tiene IDs ni horas; fecha/producto/importe no es una clave suficiente.
- Estado y pagos: una venta histórica no prueba por sí sola que deba clasificarse como una operación operativa actual completa/pagada.
- Fechas: convertir seriales por `Date`/UTC puede mover el día.
- Proveedores: las líneas de compra no tienen proveedor; no debe inferirse desde una lista auxiliar.

## Diseño recomendado

1. Crear una migración futura con una tabla de control `historical_import_records` (service-role only) que guarde hash del archivo, hoja, fila, fingerprint, tipo de entidad, estado, target_id y diagnóstico. Restricción única por archivo/hoja/fila y otra por fingerprint revisado para idempotencia.
2. Agregar a `orders` y `purchases` campos explícitos de procedencia histórica y `affects_inventory = false`, o estados históricos separados. No ocultar esta semántica solo en texto libre.
3. Crear RPCs transaccionales exclusivas `import_historical_sale` e `import_historical_purchase`, ejecutables solo por service role. Deben insertar cabecera, líneas y pagos/proveniencia sin invocar `apply_sale_inventory`, `complete_store_sale`, `deliver_order` ni `confirm_purchase`.
4. Para compras, usar un estado `historical` inmutable y `affects_inventory=false`; no actualizar `products.cost` ni `cost_source_purchase_item_id`. Las filas sin proveedor/producto resuelto permanecen en staging/revisión.
5. Para ventas, preservar `occurred_on` como `date`. Insertar un pago solo si el medio es mapeable de forma inequívoca; valores desconocidos deben quedar en revisión, no forzarse a `other` silenciosamente.
6. Crear triggers defensivos que impidan generar `inventory_movements` para entidades `affects_inventory=false`. Además, comparar antes/después hash de `products(id,stock,cost,updated_at)` y de `inventory_movements`.
7. No crear productos ni proveedores automáticamente. Exigir un mapping versionado y aprobado para `AMBIGUOUS`/`NOT_FOUND`.
8. Procesar por lotes pequeños y atómicos, con rollback total por lote y reporte reproducible.

## Diseño del dry-run futuro

El dry-run debe usar exactamente el mismo parser, normalización, aliases y validadores que la ejecución, pero sin invocar RPCs de escritura. Para cada fila debe emitir: hoja/fila, fingerprint, tipo, fecha, valores fuente, product_id, supplier_id, estado `INSERT`/`OMIT`/`REVIEW`/`INVALID`, motivo y candidato de duplicado.
El resumen debe informar filas a insertar/omitir/revisar, total esperado de compras, ventas, `purchase_items`, `order_items` y pagos. Antes de permitir ejecución debe verificar que los hashes de stock/costo/movimientos coinciden con el snapshot del dry-run y que todos los mappings están aprobados.

## Huella de esta auditoría

- Hash lógico del conjunto de ventas: `90cc6ca6a7fc45ef4e0f50093b70e1fb4933ed2996ef8dbfed5f6e0fe9ef28cd`.
- Hash lógico del conjunto de compras: `2b3a654c80d581f46900bd5021ec46469b55358732d29e29951c93c6795ca4c7`.
- Operaciones remotas ejecutadas: únicamente `SELECT`.
- Escrituras remotas: ninguna.
