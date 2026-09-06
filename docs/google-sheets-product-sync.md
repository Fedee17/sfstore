# Sincronización Google Sheets -> SFSTORE

La integración actualiza únicamente las filas editadas de `Producto Perfumes`, `Termos y Mates` y `Precios Productos`. Las demás hojas y columnas se ignoran.

## Requisitos

- SFSTORE desplegado en una URL HTTPS pública.
- `GOOGLE_SHEETS_SYNC_SECRET` configurado como variable privada en el hosting.
- El mismo valor guardado en Apps Script como `SFSTORE_SYNC_SECRET`.
- Endpoint público: `https://dominio-final.com/api/integrations/google-sheets/product-sync`.

Google Apps Script se ejecuta en infraestructura de Google. No puede llamar `localhost` ni `http://192.168.56.1:3000`. Hasta tener deploy público, usar la previsualización manual del admin o un túnel temporal configurado manualmente.

## Instalar Apps Script

1. Abrir el Google Sheet maestro.
2. Ir a **Extensiones > Apps Script**.
3. Copiar el contenido de `scripts/google-sheets-product-sync.gs`.
4. Abrir **Configuración del proyecto > Propiedades de secuencia de comandos**.
5. Crear `SFSTORE_SYNC_ENDPOINT` con la URL HTTPS completa del endpoint.
6. Crear `SFSTORE_SYNC_SECRET` con el mismo secreto privado configurado en el hosting.
7. Abrir **Activadores** y crear uno nuevo.
8. Elegir la función `handleSfstoreEdit`.
9. Fuente del evento: **Desde hoja de cálculo**.
10. Tipo de evento: **Al editar**.
11. Autorizar el trigger con la cuenta propietaria del Sheet.

No usar un `onEdit` simple: `UrlFetchApp` necesita el trigger instalable autorizado.

## Payload

```json
{
  "sheet": "Producto Perfumes",
  "rows": [
    {
      "rowNumber": 27,
      "row": {
        "Producto": "Lattafa Asad",
        "Precio de venta": "79922",
        "Precio final con descuento": "61540",
        "Intensidad": "intenso"
      },
      "editedColumn": "Intensidad",
      "timestamp": "2026-08-11T12:00:00.000Z"
    }
  ]
}
```

El endpoint admite hasta 30 filas por request. El script divide automáticamente pegados más grandes en batches controlados.

## Reglas

- Producto existente: se actualiza por slug.
- Renombre de una única celda Producto: se envía el nombre anterior para localizar el slug previo.
- Producto nuevo: solo se crea si tiene nombre y precios válidos.
- Celdas vacías: no borran precios, costo ni atributos existentes.
- `price`: precio lista/tarjeta/Mercado Pago.
- `transfer_price`: efectivo/transferencia y debe ser menor que `price`.
- Productos restringidos se bloquean.
- No se sincronizan stock, featured, imágenes, órdenes ni datos administrativos.

## Respuestas y diagnóstico

- `200`: batch procesado; revisar `created`, `updated`, `blocked`, `invalid`, `errors` y `results`.
- `401`: secret faltante o incorrecto.
- `413`: payload demasiado grande.
- `415`: Content-Type distinto de JSON.
- `422`: hoja o estructura inválida.
- `503`: falta configurar el secret en SFSTORE.

Apps Script registra resultados en **Ejecuciones** y `console`/`Logger`; no muestra popups por cada edición.
