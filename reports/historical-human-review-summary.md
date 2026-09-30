# Revisión humana de migración histórica

> Documento de preparación. No asigna mappings finales, no corrige filas y no escribe en Supabase.

## Resumen

- Mappings pendientes: 0.
- Ventas problemáticas: 51 filas; dry-run: 40 REVIEW y 2 INVALID.
- Compras problemáticas: 42 filas; dry-run: 21 REVIEW.
- Duplicados potenciales: 5 grupos de ventas; no se detectaron grupos de compras.
- Compras sin fecha: 6.

## Impacto económico

Los importes se superponen: el impacto de mappings no resueltos está contenido en las filas REVIEW y no debe sumarse otra vez.

| Conjunto | Ventas | Compras | Total |
|---|---:|---:|---:|
| Mappings no resueltos | 0.00 | 0.00 | 0.00 |
| Filas REVIEW | 1277980.50 | 1582722.00 | 2860702.50 |
| Filas INVALID | 0.00 | 0.00 | 0.00 |

Si no se resuelve ninguna fila pendiente, quedarían fuera de la importación $2860702.50: $1277980.50 de ventas y $1582722.00 de compras.

## Propuesta Yara

| Nombre Excel | Candidato canónico propuesto | Alternativa | Estado final |
|---|---|---|---|
| Lattafa Yara rosa | Lattafa Yara Rosa (05b34469-3eb8-4148-8e97-9a19f1c2df6e) | Lattafa Yara Rosa (f1cb2323-0e7f-49d6-a26f-110595c90e55) | REVIEW |
| Lattafa Yara Rosa | Lattafa Yara Rosa (05b34469-3eb8-4148-8e97-9a19f1c2df6e) | Lattafa Yara Rosa (f1cb2323-0e7f-49d6-a26f-110595c90e55) | REVIEW |
| Lattafa Yara Tous | Lattafa Yara Tous (e53066cc-9c35-47e2-8d27-0fe5fb425ce8) | Lattafa Yara Tous (ef80b721-2c20-466d-8584-a9ab852dd6ca) | REVIEW |

La propuesta prioriza `05b34469...` para Yara Rosa y `e53066cc...` para Yara Tous por stock/completitud. No se completó `final_product_id` ni se modificaron productos.

## Ventas con precio o total cero

| Fila | Fecha | Producto | Cantidad | Precio | Total | Interpretación |
|---:|---|---|---:|---:|---:|---|
| 109 | 2026-06-27 | Decant 9 AM | 1 | 0.00 | 0.00 | Podría ser regalo, bonificación o dato faltante; efectivo y margen cero no permiten distinguirlo. REVIEW. |
| 110 | 2026-06-27 | Decant Club de nuit iconic | 1 | 0.00 | 0.00 | Podría ser regalo, bonificación o dato faltante; efectivo y margen cero no permiten distinguirlo. REVIEW. |

## Totales inconsistentes

| Fila | Fecha | Producto | Informado | Calculado | Diferencia informado-calculado |
|---:|---|---|---:|---:|---:|
| 40 | 2025-10-20 | Lattafa Musamam White Intense | 74787.50 | 77500.00 | -2712.50 |
| 91 | 2026-05-13 | Decant Bharara king | 11670.00 | 11000.00 | 670.00 |
| 92 | 2026-05-13 | Decant dubai nigth | 11670.00 | 11000.00 | 670.00 |
| 93 | 2026-05-13 | Decant 9 pm elixir | 11670.00 | 11000.00 | 670.00 |

No se eligió entre el total informado y el calculado. La recomendación es `IMPORT_WITH_CORRECTION`, pendiente de decisión humana.

## Duplicados potenciales de ventas

### Grupo 1

- Filas: 13, 14.
- Fecha: 2025-07-10.
- Producto: VAPE ELFBAR 30K.
- Cantidad: 1; precio: 63581.00; total: 63581.00.
- Decisión: REVIEW; no eliminar automáticamente.

### Grupo 2

- Filas: 16, 20.
- Fecha: 2025-07-11.
- Producto: TERMO MATESYSTEM.
- Cantidad: 1; precio: 60600.00; total: 60600.00.
- Decisión: REVIEW; no eliminar automáticamente.

### Grupo 3

- Filas: 36, 37.
- Fecha: 2025-10-15.
- Producto: AIRPODS PRO 2.
- Cantidad: 1; precio: 36000.00; total: 36000.00.
- Decisión: REVIEW; no eliminar automáticamente.

### Grupo 4

- Filas: 70, 71.
- Fecha: 2026-04-09.
- Producto: Despolvillador.
- Cantidad: 1; precio: 8000.00; total: 8000.00.
- Decisión: REVIEW; no eliminar automáticamente.

### Grupo 5

- Filas: 79, 82.
- Fecha: 2026-04-16.
- Producto: Termo media manija negro 1L.
- Cantidad: 1; precio: 27900.00; total: 27900.00.
- Decisión: REVIEW; no eliminar automáticamente.

## Compras sin fecha

| Fila | Producto | Cantidad | Costo | Total | Contexto |
|---:|---|---:|---:|---:|---|
| 154 | Bombilla de alpaca y bronce cincelada | 1 | 11900.00 | 11900.00 | Anterior fechada: fila 153, 2026-04-15, Autocebante 2 en 1. Posterior fechada: fila 160, 2026-05-11, Lattafa Yara Candy. Intervalo solo orientativo; no asignar fecha automáticamente. |
| 155 | Camionero Criollo Base de Cuero | 1 | 8500.00 | 8500.00 | Anterior fechada: fila 153, 2026-04-15, Autocebante 2 en 1. Posterior fechada: fila 160, 2026-05-11, Lattafa Yara Candy. Intervalo solo orientativo; no asignar fecha automáticamente. |
| 156 | Combo 5 imperiales algarrobo acero + 5 pico loro | 5 | 9998.00 | 49990.00 | Anterior fechada: fila 153, 2026-04-15, Autocebante 2 en 1. Posterior fechada: fila 160, 2026-05-11, Lattafa Yara Candy. Intervalo solo orientativo; no asignar fecha automáticamente. |
| 157 | Imperial Con Refuerzo Alpaca Y Base De Bolitas | 1 | 22900.00 | 22900.00 | Anterior fechada: fila 153, 2026-04-15, Autocebante 2 en 1. Posterior fechada: fila 160, 2026-05-11, Lattafa Yara Candy. Intervalo solo orientativo; no asignar fecha automáticamente. |
| 158 | Termo Media Manija Negro | 3 | 12500.00 | 37500.00 | Anterior fechada: fila 153, 2026-04-15, Autocebante 2 en 1. Posterior fechada: fila 160, 2026-05-11, Lattafa Yara Candy. Intervalo solo orientativo; no asignar fecha automáticamente. |
| 159 | Torpedo Criollo Con Base | 1 | 19000.00 | 19000.00 | Anterior fechada: fila 153, 2026-04-15, Autocebante 2 en 1. Posterior fechada: fila 160, 2026-05-11, Lattafa Yara Candy. Intervalo solo orientativo; no asignar fecha automáticamente. |

Las seis están entre una fila fechada el 2026-04-15 y otra fechada el 2026-05-11, pero la hoja no mantiene orden cronológico estricto. Ese intervalo es solo contexto y no autoriza asignar una fecha.

## Decisiones humanas necesarias

1. Confirmar o rechazar el candidato de cada mapping; completar `final_product_id` y `final_decision` solo después de esa revisión.
2. Decidir si las dos ventas cero fueron regalo/bonificación, dato faltante u operación a omitir.
3. Elegir el total correcto de las cuatro ventas inconsistentes usando comprobantes externos.
4. Determinar si cada par repetido representa dos ventas reales o una duplicación de carga.
5. Completar las seis fechas de compra solo con evidencia externa.
6. Revisar la fila con deuda antes de generar cualquier pago histórico.

