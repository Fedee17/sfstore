type GoogleVisualizationResponse = {
  table?: {
    cols?: Array<{ label?: string }>;
    rows?: Array<{ c?: Array<{ v?: unknown; f?: string } | null> }>;
  };
};

export function parseGoogleVisualizationRows(responseText: string) {
  const jsonStart = responseText.indexOf("{");
  const jsonEnd = responseText.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error("Google devolvió una respuesta vacía o no válida.");
  }
  let payload: GoogleVisualizationResponse;
  try {
    payload = JSON.parse(responseText.slice(jsonStart, jsonEnd + 1)) as GoogleVisualizationResponse;
  } catch {
    throw new Error("Google devolvió una respuesta que no se pudo interpretar.");
  }
  const headers = payload.table?.cols?.map((column) => column.label?.trim() ?? "") ?? [];
  const rows = payload.table?.rows ?? [];
  if (headers.length === 0 || rows.length === 0) {
    throw new Error("La hoja no tiene columnas reconocidas.");
  }
  return rows.map((row) => Object.fromEntries(
    headers.flatMap((header, index) => header ? [[header, row.c?.[index]?.v ?? ""]] : []),
  ));
}
