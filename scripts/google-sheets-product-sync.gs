const SFSTORE_SYNC_SHEETS = {
  "Producto Perfumes": [
    "Producto", "Costo unitario", "Precio de venta", "Precio final con descuento",
    "Margen (%)", "Descuento",
    "Proveedor", "Categoría comercial", "Familia olfativa", "Intensidad",
    "Momento", "Género", "Disponible como decant"
  ],
  "Termos y Mates": [
    "Producto", "Precio de venta", "Precio final con descuento", "Descuento", "Tipo de mate",
    "Material", "Color", "Uso"
  ],
  "Precios Productos": [
    "Producto", "Costo unitario", "PORCENTAJE GANANCIA", "PRECIO CON DESCUENTO",
    "DESCUENTO", "PRECIO LISTA"
  ]
};

const SFSTORE_SYNC_BATCH_SIZE = 30;

function normalizeSfstoreHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[¿?()%.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function handleSfstoreEdit(e) {
  if (!e || !e.range) {
    console.log("[SFSTORE sync] Sin evento/rango; no se sincroniza.");
    return;
  }
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const allowedColumns = SFSTORE_SYNC_SHEETS[sheetName];
  if (!allowedColumns) {
    console.log("[SFSTORE sync] Hoja ignorada: " + sheetName);
    return;
  }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) {
    console.warn("[SFSTORE sync] Otra sincronización sigue en curso.");
    return;
  }
  try {
    const lastColumn = sheet.getLastColumn();
    if (lastColumn < 1 || e.range.getRow() < 2) {
      console.log("[SFSTORE sync] Rango ignorado en " + sheetName + ": fila=" + e.range.getRow() + ", columnas=" + lastColumn);
      return;
    }
    const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    const allowed = new Set(allowedColumns.map(normalizeSfstoreHeader));
    const editedHeaders = headers.slice(e.range.getColumn() - 1, e.range.getLastColumn())
      .filter(function (header) { return allowed.has(normalizeSfstoreHeader(header)); });
    if (editedHeaders.length === 0) {
      const editedDisplayHeaders = headers.slice(e.range.getColumn() - 1, e.range.getLastColumn()).join(", ");
      console.log("[SFSTORE sync] Columnas ignoradas en " + sheetName + ": " + editedDisplayHeaders);
      return;
    }
    SpreadsheetApp.flush();
    const startRow = Math.max(2, e.range.getRow());
    const endRow = e.range.getLastRow();
    const rowCount = endRow - startRow + 1;
    if (rowCount <= 0) {
      console.log("[SFSTORE sync] Sin filas de datos para sincronizar en " + sheetName + ".");
      return;
    }
    console.log("[SFSTORE sync] Enviando " + rowCount + " fila(s) de " + sheetName + "; columnas: " + editedHeaders.join(", "));
    const values = sheet.getRange(startRow, 1, rowCount, lastColumn).getDisplayValues();
    const rows = values.map(function (valuesRow, index) {
      const row = {};
      headers.forEach(function (header, columnIndex) {
        if (header) row[header] = valuesRow[columnIndex];
      });
      const isSingleProductEdit = rowCount === 1 && e.range.getNumColumns() === 1 && normalizeSfstoreHeader(editedHeaders[0]) === "producto";
      return {
        rowNumber: startRow + index,
        row: row,
        editedColumn: editedHeaders[0],
        previousProductName: isSingleProductEdit && e.oldValue ? String(e.oldValue) : undefined,
        timestamp: new Date().toISOString()
      };
    });
    for (let index = 0; index < rows.length; index += SFSTORE_SYNC_BATCH_SIZE) {
      sendSfstoreProductBatch_(sheetName, rows.slice(index, index + SFSTORE_SYNC_BATCH_SIZE));
    }
  } catch (error) {
    console.error("[SFSTORE sync] Error", error && error.message ? error.message : error);
  } finally {
    lock.releaseLock();
  }
}

function sendSfstoreProductBatch_(sheetName, rows) {
  const properties = PropertiesService.getScriptProperties();
  const endpoint = properties.getProperty("SFSTORE_SYNC_ENDPOINT");
  const secret = properties.getProperty("SFSTORE_SYNC_SECRET");
  if (!endpoint || !secret) {
    throw new Error("Faltan SFSTORE_SYNC_ENDPOINT o SFSTORE_SYNC_SECRET en Script Properties.");
  }
  const response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + secret },
    payload: JSON.stringify({ sheet: sheetName, rows: rows }),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    console.error("[SFSTORE sync] HTTP " + status + ": " + body);
    return;
  }
  console.log("[SFSTORE sync] OK: " + body);
}
